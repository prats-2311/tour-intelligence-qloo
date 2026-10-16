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

describe("number tolerance edge cases (documents current behaviour)", () => {
  const affinity: EvidenceItem[] = [{ id: "a1", entityIds: [], names: [], numbers: [0.82] }];
  it("CONCERN: integer 1 is accepted against a 0-1 affinity of 0.82 (tolerance 0.5)", () => {
    expect(verifyClaims([claim({ evidence_refs: ["a1"], numbers: [1] })], affinity).verified).toHaveLength(1);
  });
  it("CONCERN: integer 0 is accepted against a 0-1 affinity of 0.4", () => {
    const ev: EvidenceItem[] = [{ id: "a2", entityIds: [], names: [], numbers: [0.4] }];
    expect(verifyClaims([claim({ evidence_refs: ["a2"], numbers: [0] })], ev).verified).toHaveLength(1);
  });
  it("rejects a 1-dp claim that differs beyond rounding", () => {
    expect(verifyClaims([claim({ evidence_refs: ["a1"], numbers: [0.9] })], affinity).removed[0]?.reason).toBe("unsupported_number");
  });
});
