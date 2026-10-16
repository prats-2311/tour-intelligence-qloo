export interface EvidenceItem {
  id: string; entityIds: string[]; names: string[]; numbers: number[];
  /** What the numbers are, shown to the model. */
  label?: string;
  /** Numbers are 0-1 scores or signed indexes (shared taste, lift, demographics): never stated as a percentage. */
  noPercent?: boolean;
}
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
// more than one decimal coarser than v (v's precision counts up to 3 decimals, so 0.98 supports a raw 0.9831760003625828), and a sub-1 evidence value is never claimed as an integer.
// `shown` is the decimal count of the stated text ("1.00" is 2 although it parses to 1); it defaults to n's own.
function numberMatches(n: number, v: number, shown?: number): boolean {
  if (!Number.isFinite(n) || !Number.isFinite(v)) return false;
  if (n === v) return true;
  const d = Math.max(decimals(n), shown ?? 0);
  const dv = decimals(v);
  if (d > 100) return false;
  if (d < Math.min(dv, 3) - 1) return false;
  if (Math.abs(v) < 1 && d < 1) return false;
  return Number(v.toFixed(d)) === n;
}

function numberSupported(n: number, pool: number[], shown?: number): boolean {
  return pool.some((v) => numberMatches(n, v, shown));
}

function rawDecimals(digits: string): number {
  const dot = digits.indexOf(".");
  return dot < 0 ? 0 : digits.length - dot - 1;
}

export interface NumberToken { raw: string; value: number; percent: boolean; scaled: boolean;
  /** Decimal places as written in the text ("1.00" is 2); 0 for scaled tokens, whose value is already scaled. */
  decimals: number }

const SCALES: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** Numeric tokens in free text: decimals, thousands separators ("1,200"), a trailing "%" and scale words ("1.2k", "38 thousand"; value is the scaled number). */
export function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(%|\s?(?:thousand|million|billion|bn|mm|k|m|b)(?![\p{L}\p{N}]))?/giu)) {
    const suffix = (m[2] ?? "").trim().toLowerCase();
    const percent = suffix === "%";
    const scale = !percent && suffix !== "" ? SCALES[suffix]! : 1;
    const base = Number(m[1]!.replace(/,/g, ""));
    out.push({ raw: m[0], value: scale === 1 ? base : Math.round(base * scale * 1e6) / 1e6, percent, scaled: scale !== 1, decimals: scale !== 1 ? 0 : rawDecimals(m[1]!) });
  }
  return out;
}

function tokenMatches(t: NumberToken, d: number): boolean {
  if (!t.percent) return numberMatches(t.value, d, t.decimals);
  // "38%" is 38 or 0.38; "0.38%" is neither 0.38 nor 0.0038 as declared.
  if (t.value > 1) return numberMatches(t.value, d, t.decimals) || (Math.abs(d) <= 1 && numberMatches(t.value / 100, d, t.decimals + 2));
  return Math.abs(d) > 1 && numberMatches(t.value, d, t.decimals);
}

/** Whether a stated number token is supported by some value in the evidence pool (percent, scale words and decimal rules included). */
export function tokenSupported(t: NumberToken, pool: number[]): boolean {
  return pool.some((d) => tokenMatches(t, d));
}

/** Decimal places the claim's text shows for a declared number ("1.00" shows 2 for a declared 1). */
function shownDecimals(n: number, text: string): number {
  let shown = 0;
  for (const t of numberTokens(text)) {
    if (t.scaled) continue;
    if (t.value === n) shown = Math.max(shown, t.decimals);
    else if (t.percent && Math.abs(t.value / 100 - n) < 1e-9) shown = Math.max(shown, t.decimals + 2);
  }
  return shown;
}

/** `knownNames` are extra names every claim may use (the playbook's own city); they never widen to other cities. */
export function verifyClaims(claims: Claim[], evidence: EvidenceItem[], knownNames: string[] = []) {
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
    const names = new Set([...items.flatMap((e) => e.names), ...knownNames].map(normaliseName).filter((n) => n !== ""));
    const numbers = items.flatMap((e) => e.numbers);
    const percentPool = items.some((e) => e.noPercent) ? items.filter((e) => !e.noPercent).flatMap((e) => e.numbers) : null;

    const badEntity = claim.entities.find((e) => {
      const n = normaliseName(e.name);
      return n === "" || !names.has(n);
    });
    if (badEntity) { removed.push({ claim, reason: "unsupported_entity", detail: badEntity.name }); continue; }
    const badNumber = claim.numbers.find((n) => !numberSupported(n, numbers, shownDecimals(n, claim.text)));
    if (badNumber !== undefined) { removed.push({ claim, reason: "unsupported_number", detail: String(badNumber) }); continue; }
    // The displayed text must not state anything the declarations do not: undeclared numbers and
    // declared entities missing from the text both remove the claim. (Undeclared proper nouns stay uncheckable.)
    // Digits inside an evidence entity name ("C3 Stage") are not stated numbers. Only the evidence's own
    // names are masked, never the claim's declared strings, so a declared name cannot hide a number.
    const matched = new Set(claim.entities.map((e) => normaliseName(e.name)));
    const evidenceNames = [...items.flatMap((e) => e.names), ...knownNames].filter((n) => matched.has(normaliseName(n)) && n.trim() !== "");
    let stated = claim.text.toLowerCase();
    for (const n of evidenceNames) stated = stated.split(n.toLowerCase()).join(" ");
    const badToken = numberTokens(stated).find((t) => !tokenSupported(t, claim.numbers) || (t.percent && percentPool !== null && !tokenSupported(t, percentPool)));
    if (badToken) { removed.push({ claim, reason: "unsupported_number", detail: badToken.raw }); continue; }
    const text = normaliseName(claim.text);
    const absent = claim.entities.find((e) => !text.includes(normaliseName(e.name)));
    if (absent) { removed.push({ claim, reason: "unsupported_entity", detail: absent.name }); continue; }
    verified.push(claim);
  }
  return { verified, removed };
}
