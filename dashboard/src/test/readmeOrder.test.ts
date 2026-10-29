import { describe, expect, it } from "vitest";
import readme from "../../../README.md?raw";

const at = (s: string): number => { const i = readme.indexOf(s); expect(i, `missing: ${s}`).toBeGreaterThan(-1); return i; };

describe("README leads with sponsor lift", () => {
  it("has the approved top block right under the H1 and badge, before 'Who pays and why'", () => {
    const order = ["# Tour Intelligence × Qloo", "[![test]", "**Route with anything. Win every city with this.**", "In Los Angeles, Mac DeMarco's fans rank Stüssy #1; it isn't in LA's overall top 20. That gap is the sponsor pitch.", "Among 10 candidates per case, Qloo put the real tour's pick at mean reciprocal rank 0.47, against 0.29 for a random order and 0.13 for the city's popularity list, which usually didn't contain the pick at all (Qloo ahead in 17 of 22 cases, p<0.001). Gemini alone did better still (0.57; not significant), and the claim checker caught 10 of 10 planted false claims. Where an LLM did better, we say so under Limits.", "Who pays and why"].map(at);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });
  it("orders Proof, honestly as Test B, claim checker, Test C placeholder, then Limits with Test A", () => {
    const proof = at("## Proof, honestly");
    const order = ["- **Test B", "- **Claim checker", "- **Test C", "<!-- TEST-C: filled after rating -->", "### Limits", "- **Test A"].map((s) => readme.indexOf(s, proof));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });
  it("keeps Test A's wording and ends with What's next before the Licence", () => {
    expect(readme).toContain("The generic LLM beat winnability (p=0.031): mean R-precision 0.82 vs 0.66, 0 wins, 6 losses, 4 ties over 10 artists.");
    expect(at("### What's next (not built)")).toBeLessThan(at("## Licence"));
    expect(at("Next: a saved taste profile for each artist on a manager's roster")).toBeGreaterThan(at("### What's next (not built)"));
  });
  it("never calls Test B city picks or claims an exact 'places higher'", () => {
    expect(readme).not.toMatch(/city picks/i);
    expect(readme).not.toMatch(/\b\d+ places higher/i);
    expect(readme).not.toMatch(/Test B[^\n]*city (ranking|picks)/i);
  });
  it("frames Test B against chance, owns the weak popularity baseline, and counts 7 amendments", () => {
    expect(readme).toContain("### Limits\n\n- The popularity baseline is weak by construction: in 18 of 22 cases the real pick wasn't on the city's popularity list, so that arm ranked it last.\n");
    expect(readme).not.toMatch(/popularity baseline 17–1/);
    expect(readme).not.toMatch(/\b6 (dated )?amendments/);
    expect(readme).toMatch(/7 dated amendments/);
  });
});
