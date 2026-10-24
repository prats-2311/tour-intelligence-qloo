import { numberTokens, verifyClaims, type EvidenceItem } from "../claims/verify.js";
import { buildEvidence } from "../narrative/evidence.js";
import type { Claim, PlaybookCard } from "../types.js";
import type { CatchRateSection, CatchRow } from "./proofResults.js";
import { sha256Hex } from "./proofStats.js";

/** Protocol: 30 claims from the recorded showcase playbooks, 10 of them planted false (one number or one entity name changed). */
export const CLAIMS_TOTAL = 30;
export const PLANTED = 10;

export interface CatchItem {
  id: string; playbook: string; planted: boolean; plantKind?: "number" | "entity";
  originalText: string; original: Claim; claim: Claim;
}
export interface CatchSet {
  items: CatchItem[];
  evidenceOf: Map<string, EvidenceItem[]>;
  namesOf: Map<string, string[]>;
  /** Recorded "verified" claims that did not verify again against their evidence (not used). */
  skipped: number;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decimalsOf = (s: string): number => { const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function validClaim(c: unknown): c is Claim {
  const x = rec(c);
  return typeof x.text === "string" && Array.isArray(x.entities) && x.entities.every((e) => typeof rec(e).name === "string")
    && Array.isArray(x.numbers) && x.numbers.every((n) => typeof n === "number") && Array.isArray(x.evidence_refs) && x.evidence_refs.every((r) => typeof r === "string");
}

function plantNumber(claim: Claim, evidence: EvidenceItem[]): Claim | null {
  const pool = evidence.flatMap((e) => e.numbers);
  for (let idx = 0; idx < claim.numbers.length; idx += 1) {
    const n = claim.numbers[idx]!;
    const str = String(n);
    if (/e/i.test(str)) continue;
    const re = new RegExp(`(?<![\\d.,])${esc(str)}(?![\\d])`);
    if (!re.test(claim.text)) continue;
    // A scaled token ("1.2k", "38 thousand") would change meaning with the number: leave those claims alone.
    if (numberTokens(claim.text).some((t) => t.scaled)) continue;
    const d = decimalsOf(str);
    const tol = 0.5 * 10 ** -d + 1e-9;
    const step = 7 * 10 ** -d;
    for (const raw of [n * 1.5, n * 0.6, n + step, n - step, n * 2.3, n * 0.31, n + 3 * step]) {
      if (!Number.isFinite(raw) || raw < 0) continue;
      const c = Number(raw.toFixed(d));
      if (c === n || pool.some((v) => Math.abs(v - c) <= tol || Math.abs(v * 100 - c) <= tol) || claim.numbers.includes(c)) continue;
      const numbers = [...claim.numbers];
      numbers[idx] = c;
      return { ...claim, text: claim.text.replace(re, c.toFixed(d)), numbers };
    }
  }
  return null;
}

function plantEntity(claim: Claim, evidence: EvidenceItem[], knownNames: string[]): Claim | null {
  const cited = new Set(evidence.filter((e) => claim.evidence_refs.includes(e.id)).flatMap((e) => e.names).concat(knownNames).map((n) => n.toLowerCase()));
  const options: Array<{ name: string; entityId?: string }> = [];
  for (const e of evidence) e.names.forEach((name, i) => { if (!/\d/.test(name) && name.length >= 3 && !cited.has(name.toLowerCase())) options.push({ name, ...(e.entityIds[i] ? { entityId: e.entityIds[i]! } : {}) }); });
  options.sort((a, b) => { const x = sha256Hex(claim.text + a.name), y = sha256Hex(claim.text + b.name); return x < y ? -1 : x > y ? 1 : 0; });
  const pick = options[0];
  if (!pick) return null;
  for (let idx = 0; idx < claim.entities.length; idx += 1) {
    const e = claim.entities[idx]!;
    if (e.name === "" || !claim.text.includes(e.name)) continue;
    const entities = claim.entities.map((x, k) => (k === idx ? { name: pick.name, ...(pick.entityId ? { entityId: pick.entityId } : {}) } : x));
    return { ...claim, text: claim.text.split(e.name).join(pick.name), entities };
  }
  return null;
}

/**
 * A false copy of the claim with exactly one number or one entity name changed, to a value or name that appears nowhere in the playbook's cited
 * evidence. Which kind goes first is the parity of the first hex digit of sha256(claim text); the other kind is the fallback. Null when neither is possible.
 */
export function plantFalse(claim: Claim, evidence: EvidenceItem[], knownNames: string[]): { claim: Claim; kind: "number" | "entity" } | null {
  const numberFirst = parseInt(sha256Hex(claim.text)[0]!, 16) % 2 === 0;
  const tries: Array<["number" | "entity", () => Claim | null]> = [["number", () => plantNumber(claim, evidence)], ["entity", () => plantEntity(claim, evidence, knownNames)]];
  if (!numberFirst) tries.reverse();
  for (const [kind, make] of tries) { const planted = make(); if (planted) return { claim: planted, kind }; }
  return null;
}

type Verify = (claims: Claim[], evidence: EvidenceItem[], knownNames: string[]) => { verified: Claim[]; removed: Array<{ claim: Claim; reason: string; detail: string }> };

/**
 * From a recorded showcase file ({ playbooks: { <city id>: events[] } }) take every claim the recorded narrative verified, keep those that verify again
 * and can be planted, choose 30 by sha256("select|" + text + id), and plant the 10 with the lowest sha256(original claim text).
 */
export function buildCatchSet(doc: unknown): CatchSet {
  const playbooks = rec(rec(doc).playbooks);
  const evidenceOf = new Map<string, EvidenceItem[]>();
  const namesOf = new Map<string, string[]>();
  const pool: Array<{ id: string; playbook: string; claim: Claim; plantable: { claim: Claim; kind: "number" | "entity" } }> = [];
  let skipped = 0;
  for (const [pid, events] of Object.entries(playbooks)) {
    if (!Array.isArray(events)) continue;
    const pb = events.find((e) => rec(e).type === "playbook");
    const nar = events.find((e) => rec(e).type === "narrative");
    const cards = rec(rec(pb).playbook).cards as PlaybookCard[] | undefined;
    const city = rec(rec(rec(pb).playbook).city);
    const narrative = rec(rec(nar).narrative);
    if (!Array.isArray(cards) || narrative.status !== "ok") continue;
    const evidence = buildEvidence(cards);
    const names = [city.name, city.country].filter((x): x is string => typeof x === "string");
    evidenceOf.set(pid, evidence); namesOf.set(pid, names);
    const seen = new Set<string>();
    let index = 0;
    for (const card of Object.values(rec(narrative.cards))) {
      for (const claim of (rec(card).verified as unknown[] | undefined) ?? []) {
        const id = `${pid}:${index++}`;
        if (!validClaim(claim) || seen.has(claim.text)) continue;
        seen.add(claim.text);
        if (verifyClaims([claim], evidence, names).removed.length > 0) { skipped += 1; continue; }
        const plantable = plantFalse(claim, evidence, names);
        if (plantable) pool.push({ id, playbook: pid, claim, plantable });
      }
    }
  }
  if (pool.length < CLAIMS_TOTAL) throw new Error(`need at least ${CLAIMS_TOTAL} verifiable, plantable claims in the playbooks, found ${pool.length}`);
  const key = (x: string, id: string): string => sha256Hex(`select|${x}|${id}`);
  const chosen = [...pool].sort((a, b) => (key(a.claim.text, a.id) < key(b.claim.text, b.id) ? -1 : 1)).slice(0, CLAIMS_TOTAL);
  const plantedIds = new Set([...chosen].sort((a, b) => {
    const x = sha256Hex(a.claim.text), y = sha256Hex(b.claim.text);
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
  }).slice(0, PLANTED).map((c) => c.id));
  const items: CatchItem[] = chosen.map((c) => {
    const planted = plantedIds.has(c.id);
    return {
      id: c.id, playbook: c.playbook, planted, ...(planted ? { plantKind: c.plantable.kind } : {}),
      originalText: c.claim.text, original: c.claim, claim: planted ? c.plantable.claim : c.claim,
    };
  });
  return { items, evidenceOf, namesOf, skipped };
}

/** Runs every chosen claim through the claim checker with its own playbook's evidence; reports how many planted claims it removed and how many true ones. */
export function runCatchRate(doc: unknown, source: string, verify: Verify = verifyClaims): CatchRateSection {
  const set = buildCatchSet(doc);
  const removedBy = new Map<Claim, { reason: string; detail: string }>();
  for (const pid of new Set(set.items.map((i) => i.playbook))) {
    const group = set.items.filter((i) => i.playbook === pid);
    const r = verify(group.map((i) => i.claim), set.evidenceOf.get(pid)!, set.namesOf.get(pid)!);
    for (const x of r.removed) removedBy.set(x.claim, { reason: x.reason, detail: x.detail });
  }
  const rows: CatchRow[] = set.items.map((i) => {
    const rem = removedBy.get(i.claim);
    return {
      id: i.id, playbook: i.playbook, text: i.claim.text, planted: i.planted, ...(i.plantKind ? { plantKind: i.plantKind } : {}),
      ...(i.planted ? { original: i.originalText } : {}), removed: rem !== undefined, ...(rem ? { reason: rem.reason, detail: rem.detail } : {}),
    };
  });
  const planted = rows.filter((r) => r.planted), real = rows.filter((r) => !r.planted);
  const caught = planted.filter((r) => r.removed).length, falseAlarms = real.filter((r) => r.removed).length;
  return {
    source, claims: rows.length, planted: planted.length, caught, catchRate: caught / planted.length,
    trueClaims: real.length, falseAlarms, falseAlarmRate: falseAlarms / real.length, rows,
  };
}
