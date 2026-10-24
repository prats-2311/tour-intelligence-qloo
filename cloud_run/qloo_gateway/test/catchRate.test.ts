import { describe, expect, it } from "vitest";
import { buildCatchSet, CLAIMS_TOTAL, PLANTED, runCatchRate } from "../src/backtest/catchRate.js";
import { sha256Hex } from "../src/backtest/proofStats.js";
import { verifyClaims } from "../src/claims/verify.js";
import { buildEvidence } from "../src/narrative/evidence.js";
import type { Claim, PlaybookCard } from "../src/types.js";

/** A synthetic recorded showcase: invented brands, `00000000-` ids. Each playbook has one sponsors card of 8 brands and N true claims. */
function synthetic(playbooks = 4, claimsEach = 10): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let p = 0; p < playbooks; p += 1) {
    const items = Array.from({ length: 8 }, (_, i) => ({ entityId: `00000000-p${p}i${i}`, name: `Brand${String.fromCharCode(65 + p)}${String.fromCharCode(97 + i)}x`, affinity: Math.round((0.99 - i * 0.021 - p * 0.003) * 100) / 100, popularity: 0.5, index: i }));
    const claims: Claim[] = Array.from({ length: claimsEach }, (_, k) => {
      const a = items[k % 8]!, b = items[(k + 3) % 8]!;
      return { text: `${a.name} (${a.affinity}) and ${b.name} (${b.affinity}) fit playbook ${String.fromCharCode(65 + p)} slot ${String.fromCharCode(97 + k)}.`, entities: [{ name: a.name, entityId: a.entityId }, { name: b.name, entityId: b.entityId }], numbers: [a.affinity, b.affinity], evidence_refs: [`sponsors:${k % 8}`, `sponsors:${(k + 3) % 8}`] };
    });
    out[`${1000 + p}`] = [
      { type: "playbook", playbook: { city: { name: `Testtown${p}`, country: "MX" }, cards: [{ kind: "sponsors", status: "ok", items }] } },
      { type: "narrative", narrative: { status: "ok", model: "m", cards: { sponsors: { verified: claims, removed: [] } } } },
    ];
  }
  return { artist: "Synthetic Artist", playbooks: out };
}

describe("buildCatchSet", () => {
  const set = buildCatchSet(synthetic());

  it("30 claims, exactly 10 planted", () => {
    expect(CLAIMS_TOTAL).toBe(30);
    expect(PLANTED).toBe(10);
    expect(set.items).toHaveLength(30);
    expect(set.items.filter((i) => i.planted)).toHaveLength(10);
  });
  it("the planted ones are the 10 lowest sha256(original claim text) among the 30", () => {
    const sorted = [...set.items].sort((a, b) => (sha256Hex(a.originalText) < sha256Hex(b.originalText) ? -1 : 1));
    expect(new Set(sorted.slice(0, 10).map((i) => i.id))).toEqual(new Set(set.items.filter((i) => i.planted).map((i) => i.id)));
  });
  it("a planted claim differs from its original in exactly one number or one entity name", () => {
    for (const i of set.items.filter((x) => x.planted)) {
      const o = i.original, c = i.claim;
      const numberDiffs = c.numbers.filter((n, k) => n !== o.numbers[k]).length;
      const nameDiffs = c.entities.filter((e, k) => e.name !== o.entities[k]!.name).length;
      expect(numberDiffs + nameDiffs).toBe(1);
      expect(i.plantKind).toBe(numberDiffs === 1 ? "number" : "entity");
      expect(c.text).not.toBe(i.originalText);
      expect(c.evidence_refs).toEqual(o.evidence_refs);
    }
  });
  it("a planted number or name appears nowhere in that playbook's cited evidence (it is genuinely false)", () => {
    for (const i of set.items.filter((x) => x.planted)) {
      const evidence = set.evidenceOf.get(i.playbook)!;
      if (i.plantKind === "number") {
        const changed = i.claim.numbers.find((n, k) => n !== i.original.numbers[k])!;
        expect(evidence.flatMap((e) => e.numbers).some((v) => Math.abs(v - changed) < 0.005)).toBe(false);
      } else {
        const changed = i.claim.entities.find((e, k) => e.name !== i.original.entities[k]!.name)!;
        const cited = evidence.filter((e) => i.claim.evidence_refs.includes(e.id)).flatMap((e) => e.names);
        expect(cited).not.toContain(changed.name);
        expect(i.claim.text).toContain(changed.name);
      }
    }
  });
  it("the true claims are true: each passes verifyClaims against its own playbook's evidence", () => {
    for (const i of set.items.filter((x) => !x.planted)) {
      const r = verifyClaims([i.claim], set.evidenceOf.get(i.playbook)!, set.namesOf.get(i.playbook)!);
      expect(r.removed).toEqual([]);
    }
  });
  it("uses both kinds of plant, is deterministic, and spreads over more than one playbook", () => {
    expect(new Set(set.items.filter((i) => i.planted).map((i) => i.plantKind))).toEqual(new Set(["number", "entity"]));
    expect(buildCatchSet(synthetic()).items.map((i) => i.id)).toEqual(set.items.map((i) => i.id));
    expect(new Set(set.items.map((i) => i.playbook)).size).toBeGreaterThan(1);
  });
  it("skips a recorded 'verified' claim that no longer verifies, and throws when fewer than 30 usable claims remain", () => {
    expect(() => buildCatchSet(synthetic(2, 10))).toThrow(/at least 30/);
    const doc = synthetic(4, 10) as { playbooks: Record<string, Array<{ narrative?: { cards: { sponsors: { verified: Claim[] } } } }>> };
    const bad: Claim = { text: "Ghost (0.5) leads.", entities: [{ name: "Ghost" }], numbers: [0.5], evidence_refs: ["sponsors:0"] };
    doc.playbooks["1000"]![1]!.narrative!.cards.sponsors.verified.push(bad);
    const s = buildCatchSet(doc);
    expect(s.skipped).toBe(1);
    expect(s.items.some((i) => i.originalText === bad.text)).toBe(false);
  });
});

describe("runCatchRate", () => {
  it("reports catch rate and false-alarm rate from verifyClaims, with each claim's removal reason", () => {
    const r = runCatchRate(synthetic(), "synthetic.json");
    expect(r).toMatchObject({ source: "synthetic.json", claims: 30, planted: 10, trueClaims: 20 });
    expect(r.rows).toHaveLength(30);
    expect(r.caught).toBe(r.rows.filter((x) => x.planted && x.removed).length);
    expect(r.falseAlarms).toBe(r.rows.filter((x) => !x.planted && x.removed).length);
    expect(r.catchRate).toBe(r.caught / 10);
    expect(r.falseAlarmRate).toBe(r.falseAlarms / 20);
    expect(r.rows.filter((x) => x.removed).every((x) => typeof x.reason === "string")).toBe(true);
    // verifyClaims is strict on both a changed number and a changed name from outside the cited evidence.
    expect(r.catchRate).toBe(1);
    expect(r.falseAlarmRate).toBe(0);
  });
  it("counts a planted claim that slips through as a miss (a verifier that approves everything catches nothing)", () => {
    const r = runCatchRate(synthetic(), "s", (claims) => ({ verified: claims, removed: [] }));
    expect(r.caught).toBe(0);
    expect(r.catchRate).toBe(0);
    expect(r.falseAlarmRate).toBe(0);
  });
});

describe("evidence comes from the playbook cards (same builder as the narrative)", () => {
  it("buildCatchSet's evidence equals buildEvidence(cards)", () => {
    const doc = synthetic() as { playbooks: Record<string, Array<{ playbook?: { cards: PlaybookCard[] } }>> };
    const set = buildCatchSet(doc);
    expect(set.evidenceOf.get("1000")).toEqual(buildEvidence(doc.playbooks["1000"]![0]!.playbook!.cards));
  });
});
