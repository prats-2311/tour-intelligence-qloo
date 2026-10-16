export interface EvidenceItem { id: string; entityIds: string[]; names: string[]; numbers: number[] }
export interface Claim { text: string; entities: Array<{ name: string; entityId?: string }>; numbers: number[]; evidence_refs: string[] }
export type RemovalReason = "no_refs" | "dangling_ref" | "unsupported_entity" | "unsupported_number";

export function normaliseName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function decimals(n: number): number {
  const text = String(n);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

function numberSupported(n: number, pool: number[]): boolean {
  const tolerance = 0.5 * 10 ** -decimals(n);
  return pool.some((v) => Math.abs(v - n) <= tolerance + 1e-9);
}

export function verifyClaims(claims: Claim[], evidence: EvidenceItem[]) {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const verified: Claim[] = [];
  const removed: Array<{ claim: Claim; reason: RemovalReason; detail: string }> = [];

  for (const claim of claims) {
    if (claim.evidence_refs.length === 0) { removed.push({ claim, reason: "no_refs", detail: "claim cites no evidence" }); continue; }
    const missing = claim.evidence_refs.find((id) => !byId.has(id));
    if (missing) { removed.push({ claim, reason: "dangling_ref", detail: missing }); continue; }
    const items = claim.evidence_refs.map((id) => byId.get(id)!);
    const ids = new Set(items.flatMap((e) => e.entityIds));
    const names = new Set(items.flatMap((e) => e.names.map(normaliseName)));
    const numbers = items.flatMap((e) => e.numbers);

    const badEntity = claim.entities.find((e) => !(e.entityId && ids.has(e.entityId)) && !names.has(normaliseName(e.name)));
    if (badEntity) { removed.push({ claim, reason: "unsupported_entity", detail: badEntity.name }); continue; }
    const badNumber = claim.numbers.find((n) => !numberSupported(n, numbers));
    if (badNumber !== undefined) { removed.push({ claim, reason: "unsupported_number", detail: String(badNumber) }); continue; }
    verified.push(claim);
  }
  return { verified, removed };
}
