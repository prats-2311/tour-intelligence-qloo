import { describe, expect, it } from "vitest";
import { normaliseName, verifyClaims, type Claim, type EvidenceItem } from "../src/claims/verify.js";

const evidence: EvidenceItem[] = [
  { id: "e1", entityIds: ["q-123"], names: ["Café Tacuba", "Corona"], numbers: [82, 0.82] },
];
const claim = (over: Partial<Claim>): Claim => ({ text: "t", entities: [], numbers: [], evidence_refs: ["e1"], ...over });

describe("normaliseName", () => {
  it("strips accents, case, punctuation and extra spaces", () => {
    expect(normaliseName("  Café   Tacuba! ")).toBe("cafe tacuba");
  });
});

describe("verifyClaims", () => {
  it("keeps a fully supported claim", () => {
    const r = verifyClaims([claim({ entities: [{ name: "cafe tacuba" }], numbers: [82] })], evidence);
    expect(r.verified).toHaveLength(1);
  });
  it("matches by entity id when given", () => {
    expect(verifyClaims([claim({ entities: [{ name: "Anything", entityId: "q-123" }] })], evidence).verified).toHaveLength(1);
  });
  it("removes a fabricated entity", () => {
    const r = verifyClaims([claim({ entities: [{ name: "Heineken" }] })], evidence);
    expect(r.removed[0]).toMatchObject({ reason: "unsupported_entity" });
  });
  it("removes an altered number but tolerates display rounding", () => {
    expect(verifyClaims([claim({ numbers: [83] })], evidence).removed[0]?.reason).toBe("unsupported_number");
    expect(verifyClaims([claim({ numbers: [0.8] })], evidence).verified).toHaveLength(1); // 0.82 shown at 1 dp
  });
  it("removes dangling refs and claims with no refs", () => {
    expect(verifyClaims([claim({ evidence_refs: ["nope"] })], evidence).removed[0]?.reason).toBe("dangling_ref");
    expect(verifyClaims([claim({ evidence_refs: [] })], evidence).removed[0]?.reason).toBe("no_refs");
  });
});

const num = (n: number, v: number) =>
  verifyClaims([claim({ evidence_refs: ["n"], numbers: [n] })], [{ id: "n", entityIds: [], names: [], numbers: [v] }]);
const ok = (n: number, v: number) => num(n, v).verified.length === 1;

describe("strict display-rounding number rule", () => {
  it("rejects integer 1 vs 0.82 and 0 vs 0.4", () => {
    expect(ok(1, 0.82)).toBe(false);
    expect(ok(0, 0.4)).toBe(false);
  });
  it("accepts legitimate rounding, rejects the rest", () => {
    expect(ok(83, 82.6)).toBe(true);
    expect(ok(83, 82.4)).toBe(false);
    expect(ok(0.8, 0.82)).toBe(true);
    expect(ok(0.8, 0.849)).toBe(false);
    expect(ok(82, 82.4)).toBe(true);
    expect(ok(82, 82)).toBe(true);
  });
  it("rejects NaN and non-finite", () => {
    expect(ok(NaN, 1)).toBe(false);
    expect(ok(1, NaN)).toBe(false);
    expect(ok(Infinity, Infinity)).toBe(false);
    expect(num(NaN, 1).removed[0]?.reason).toBe("unsupported_number");
  });
  it("handles exponent notation", () => {
    expect(ok(1e-7, 0)).toBe(false);
    expect(ok(0, 1e-7)).toBe(false);
    expect(ok(1.5e-7, 1.5e-7)).toBe(true);
  });
});

describe("exact-equal numeric claims", () => {
  it("accepts 0 vs 0 and 0 vs -0", () => {
    expect(ok(0, 0)).toBe(true);
    expect(ok(0, -0)).toBe(true);
  });
  it("still rejects 0 vs 0.4 and 1 vs 0.82", () => {
    expect(ok(0, 0.4)).toBe(false);
    expect(ok(1, 0.82)).toBe(false);
  });
});

describe("normaliseName scripts", () => {
  it("preserves CJK, kana voicing and Devanagari", () => {
    expect(normaliseName("東京タワー")).toBe("東京タワー");
    expect(normaliseName("ばなな")).not.toBe(normaliseName("ぱなな"));
    const a = normaliseName("कॉफी");
    const b = normaliseName("कोरोना");
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

describe("empty names and uncheckable claims", () => {
  it("empty normalised names never match", () => {
    const ev: EvidenceItem[] = [{ id: "x", entityIds: [], names: ["!!!"], numbers: [] }];
    const r = verifyClaims([claim({ evidence_refs: ["x"], entities: [{ name: "---" }] })], ev);
    expect(r.removed[0]?.reason).toBe("unsupported_entity");
  });
  it("removes claims with no entities and no numbers", () => {
    const r = verifyClaims([claim({})], evidence);
    expect(r.removed[0]?.reason).toBe("no_checkable_content");
    expect(verifyClaims([claim({ evidence_refs: ["nope"] })], evidence).removed[0]?.reason).toBe("dangling_ref");
  });
});
