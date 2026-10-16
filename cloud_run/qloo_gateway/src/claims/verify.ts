export interface EvidenceItem { id: string; entityIds: string[]; names: string[]; numbers: number[] }
import type { Claim, RemovalReason } from "../types.js";
export type { Claim, RemovalReason } from "../types.js";

export function normaliseName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decimals(n: number): number {
  const text = String(n);
  const e = text.toLowerCase().indexOf("e");
  if (e >= 0) {
    const mantissa = text.slice(0, e);
    const exponent = Number(text.slice(e + 1));
    const dot = mantissa.indexOf(".");
    const md = dot < 0 ? 0 : mantissa.length - dot - 1;
    return Math.max(0, md - exponent);
  }
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

// n is supported by v iff n is v correctly rounded to n's own decimal places, n is not
// more than one decimal coarser than v, and a sub-1 evidence value is never claimed as an integer.
function numberMatches(n: number, v: number): boolean {
  if (!Number.isFinite(n) || !Number.isFinite(v)) return false;
  if (n === v) return true;
  const d = decimals(n);
  const dv = decimals(v);
  if (d > 100) return false;
  if (d < dv - 1) return false;
  if (Math.abs(v) < 1 && d < 1) return false;
  return Number(v.toFixed(d)) === n;
}

function numberSupported(n: number, pool: number[]): boolean {
  return pool.some((v) => numberMatches(n, v));
}

export interface NumberToken { raw: string; value: number; percent: boolean; scaled: boolean }

const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** Numeric tokens in free text: decimals, thousands separators ("1,200"), a trailing "%" and scale words ("1.2k", "38 thousand"; value is the scaled number). */
export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(%|\s?(?:thousand|million|billion|bn|mm|k|m|b)(?![\p{L}\p{N}]))?/giu)) {
    const suffix = (m[2] ?? "").trim().toLowerCase();
    const percent = suffix === "%";
    const scale = !percent && suffix !== "" ? SCALES[suffix]! : 1;
    const base = Number(m[1]!.replace(/,/g, ""));
    out.push({ raw: m[0], value: scale === 1 ? base : Math.round(base * scale * 1e6) / 1e6, percent, scaled: scale !== 1 });
  }
  return out;
}

export function verifyClaims(claims: Claim[], evidence: EvidenceItem[]) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const verified: Claim[] = [];
  const removed: Array<{ claim: Claim; reason: RemovalReason; detail: string }> = [];

  for (const claim of claims) {
    if (claim.evidence_refs.length === 0) { removed.push({ claim, reason: "no_refs", detail: "claim cites no evidence" }); continue; }
    const missing = claim.evidence_refs.find((id) => !byId.has(id));
    if (missing) { removed.push({ claim, reason: "dangling_ref", detail: missing }); continue; }
    if (claim.entities.length === 0 && claim.numbers.length === 0) {
      removed.push({ claim, reason: "no_checkable_content", detail: "claim has no entities or numbers to verify" });
      continue;
    }
    const items = claim.evidence_refs.map((id) => byId.get(id)!);
    const names = new Set(items.flatMap((e) => e.names.map(normaliseName)).filter((n) => n !== ""));
    const numbers = items.flatMap((e) => e.numbers);

    const badEntity = claim.entities.find((e) => {
      const n = normaliseName(e.name);
      return n === "" || !names.has(n);
    });
    if (badEntity) { removed.push({ claim, reason: "unsupported_entity", detail: badEntity.name }); continue; }
    const badNumber = claim.numbers.find((n) => !numberSupported(n, numbers));
    if (badNumber !== undefined) { removed.push({ claim, reason: "unsupported_number", detail: String(badNumber) }); continue; }
    // The displayed text must not state anything the declarations do not: undeclared numbers and
    // declared entities missing from the text both remove the claim. (Undeclared proper nouns stay uncheckable.)
    // Digits inside an evidence entity name ("C3 Stage") are not stated numbers. Only the evidence's own
    // names are masked, never the claim's declared strings, so a declared name cannot hide a number.
    const matched = new Set(claim.entities.map((e) => normaliseName(e.name)));
    const evidenceNames = items.flatMap((e) => e.names).filter((n) => matched.has(normaliseName(n)) && n.trim() !== "");
    let stated = claim.text.toLowerCase();
    for (const n of evidenceNames) stated = stated.split(n.toLowerCase()).join(" ");
    const tokenOk = (t: NumberToken, d: number): boolean => {
      if (!t.percent) return numberMatches(t.value, d);
      // "38%" is 38 or 0.38; "0.38%" is neither 0.38 nor 0.0038 as declared.
      if (t.value > 1) return numberMatches(t.value, d) || (Math.abs(d) <= 1 && numberMatches(t.value / 100, d));
      return Math.abs(d) > 1 && numberMatches(t.value, d);
    };
    const badToken = numberTokens(stated).find((t) => !claim.numbers.some((d) => tokenOk(t, d)));
    if (badToken) { removed.push({ claim, reason: "unsupported_number", detail: badToken.raw }); continue; }
    const text = normaliseName(claim.text);
    const absent = claim.entities.find((e) => !text.includes(normaliseName(e.name)));
    if (absent) { removed.push({ claim, reason: "unsupported_entity", detail: absent.name }); continue; }
    verified.push(claim);
  }
  return { verified, removed };
}
