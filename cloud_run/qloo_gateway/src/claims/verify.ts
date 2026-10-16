export interface EvidenceItem { id: string; entityIds: string[]; names: string[]; numbers: number[] }
export interface Claim { text: string; entities: Array<{ name: string; entityId?: string }>; numbers: number[]; evidence_refs: string[] }
export type RemovalReason = "no_refs" | "dangling_ref" | "unsupported_entity" | "unsupported_number" | "no_checkable_content";

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
    const ids = new Set(items.flatMap((e) => e.entityIds));
    const names = new Set(items.flatMap((e) => e.names.map(normaliseName)).filter((n) => n !== ""));
    const numbers = items.flatMap((e) => e.numbers);

    const badEntity = claim.entities.find((e) => {
      if (e.entityId && ids.has(e.entityId)) return false;
      const n = normaliseName(e.name);
      return n === "" || !names.has(n);
    });
    if (badEntity) { removed.push({ claim, reason: "unsupported_entity", detail: badEntity.name }); continue; }
    const badNumber = claim.numbers.find((n) => !numberSupported(n, numbers));
    if (badNumber !== undefined) { removed.push({ claim, reason: "unsupported_number", detail: String(badNumber) }); continue; }
    verified.push(claim);
  }
  return { verified, removed };
}
