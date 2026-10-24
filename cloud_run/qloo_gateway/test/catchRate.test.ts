import { describe, expect, it } from "vitest";
import { buildCatchSet, CLAIMS_TOTAL, PLANTED, plantFalse, runCatchRate } from "../src/backtest/catchRate.js";
import { sha256Hex } from "../src/backtest/proofStats.js";
import { verifyClaims } from "../src/claims/verify.js";
import { buildEvidence } from "../src/narrative/evidence.js";
import type { Claim, PlaybookCard } from "../src/types.js";

/** A synthetic recorded showcase: invented brands, `00000000-` ids. Each playbook has one sponsors card of 8 brands and N true claims. */
function synthetic(playbooks = 4, claimsEach = 10, digitNames = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let p = 0; p < playbooks; p += 1) {
    const items = Array.from({ length: 8 }, (_, i) => ({ entityId: `00000000-p${p}i${i}`, name: digitNames ? `Brand${p}${i}x` : `Brand${String.fromCharCode(65 + p)}${String.fromCharCode(97 + i)}x`, affinity: Math.round((0.99 - i * 0.021 - p * 0.003) * 100) / 100, popularity: 0.5, index: i }));
    const venues = Array.from({ length: 4 }, (_, i) => ({ entityId: `00000000-v${p}i${i}`, name: digitNames ? `Hall${p}${i}x` : `Hall${String.fromCharCode(65 + p)}${String.fromCharCode(97 + i)}x`, affinity: Math.round((0.7 - i * 0.043 - p * 0.011) * 100) / 100 }));
    const claims: Claim[] = Array.from({ length: claimsEach }, (_, k) => {
      const a = items[k % 8]!, b = items[(k + 3) % 8]!;
      return { text: `${a.name} (${a.affinity}) and ${b.name} (${b.affinity}) fit playbook ${String.fromCharCode(65 + p)} slot ${String.fromCharCode(97 + k)}.`, entities: [{ name: a.name, entityId: a.entityId }, { name: b.name, entityId: b.entityId }], numbers: [a.affinity, b.affinity], evidence_refs: [`sponsors:${k % 8}`, `sponsors:${(k + 3) % 8}`] };
    });
    out[`${1000 + p}`] = [
      { type: "playbook", playbook: { city: { name: `Testtown${p}`, country: "MX" }, cards: [{ kind: "sponsors", status: "ok", items }, { kind: "venue_fit", status: "ok", items: venues }] } },
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
  const kindOf = (i: (typeof set.items)[number]) => i.plantKind!;
  it("a planted claim differs from its original in exactly one number or one entity name, and exactly one token of its text", () => {
    for (const i of set.items.filter((x) => x.planted)) {
      const o = i.original, c = i.claim;
      const numberDiffs = c.numbers.filter((n, k) => n !== o.numbers[k]).length;
      const nameDiffs = c.entities.filter((e, k) => e.name !== o.entities[k]!.name).length;
      expect(numberDiffs + nameDiffs).toBe(1);
      expect(kindOf(i) === "entity").toBe(nameDiffs === 1);
      expect(c.evidence_refs).toEqual(o.evidence_refs);
      const a = c.text.split(/(\s+)/), b = i.originalText.split(/(\s+)/);
      // tokens that differ: one number token, or the words of one name (names here are one word)
      expect(a.length).toBe(b.length);
      expect(a.filter((t, k) => t !== b[k])).toHaveLength(1);
    }
  });
  it("number plants: half use a number real elsewhere in the playbook but not on the cited cards, half use a number in no evidence", () => {
    const nums = set.items.filter((i) => i.planted && kindOf(i) !== "entity");
    const plausible = nums.filter((i) => kindOf(i) === "number_plausible");
    expect(plausible.length).toBeGreaterThan(0);
    expect(Math.abs(plausible.length - (nums.length - plausible.length))).toBeLessThanOrEqual(1);
    for (const i of nums) {
      const evidence = set.evidenceOf.get(i.playbook)!;
      const changed = i.claim.numbers.find((n, k) => n !== i.original.numbers[k])!;
      const cited = evidence.filter((e) => i.claim.evidence_refs.includes(e.id)).flatMap((e) => e.numbers);
      const other = evidence.filter((e) => !i.claim.evidence_refs.includes(e.id)).flatMap((e) => e.numbers);
      expect(cited.some((v) => Math.abs(v - changed) < 0.005)).toBe(false);
      expect(other.some((v) => Math.abs(v - changed) < 0.005)).toBe(kindOf(i) === "number_plausible");
    }
  });
  it("when entity plants are impossible they fall back to the current alternation variant, so number plants still split half and half", () => {
    // Names with digits cannot be swapped in, so every entity plant fails.
    const s = buildCatchSet(synthetic(4, 10, true));
    const kinds = s.items.filter((i) => i.planted).map((i) => i.plantKind);
    expect(kinds).not.toContain("entity");
    expect(kinds.filter((k) => k === "number_plausible")).toHaveLength(5);
    expect(kinds.filter((k) => k === "number_absent")).toHaveLength(5);
  });
  it("entity plants swap in a name from another card, never one the claim cites", () => {
    const ents = set.items.filter((i) => i.planted && kindOf(i) === "entity");
    expect(ents.length).toBeGreaterThan(0);
    for (const i of ents) {
      const changed = i.claim.entities.find((e, k) => e.name !== i.original.entities[k]!.name)!;
      const evidence = set.evidenceOf.get(i.playbook)!;
      const home = evidence.find((e) => e.names.includes(changed.name))!;
      expect(home.id.startsWith("venue_fit:")).toBe(true);
      expect(i.claim.evidence_refs.some((r) => r.startsWith("venue_fit:"))).toBe(false);
      expect(i.claim.text).toContain(changed.name);
    }
  });
  it("replaces only the first occurrence of a name that appears twice in the text", () => {
    const items = [0, 1, 2].map((i) => ({ entityId: `00000000-z${i}`, name: `Zorb${String.fromCharCode(97 + i)}x`, affinity: 0.9 - i * 0.05 }));
    const venues = [{ entityId: "00000000-q0", name: "Quillhallx", affinity: 0.5 }];
    const claim: Claim = { text: "Zorbax is strong, and Zorbax stays strong.", entities: [{ name: "Zorbax" }], numbers: [], evidence_refs: ["sponsors:0"] };
    const r = plantFalse(claim, buildEvidence([{ kind: "sponsors", status: "ok", items }, { kind: "venue_fit", status: "ok", items: venues }] as unknown as PlaybookCard[]), [], "entity");
    expect(r!.kind).toBe("entity");
    expect(r!.claim.text).toBe("Quillhallx is strong, and Zorbax stays strong.");
  });
  it("the true claims are true: each passes verifyClaims against its own playbook's evidence", () => {
    for (const i of set.items.filter((x) => !x.planted)) {
      const r = verifyClaims([i.claim], set.evidenceOf.get(i.playbook)!, set.namesOf.get(i.playbook)!);
      expect(r.removed).toEqual([]);
    }
  });
  it("uses both kinds of plant, is deterministic, and spreads over more than one playbook", () => {
    expect(new Set(set.items.filter((i) => i.planted).map((i) => i.plantKind))).toEqual(new Set(["number_plausible", "number_absent", "entity"]));
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
    expect(r.falseAlarmNote).toMatch(/already accepted/);
    expect(Object.values(r.byType).reduce((n, t) => n + t.planted, 0)).toBe(10);
    expect(r.byType.number_plausible.catchRate).toBe(1);
    for (const t of Object.values(r.byType)) expect(t.caught).toBeLessThanOrEqual(t.planted);
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
