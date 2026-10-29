import { describe, expect, it } from "vitest";
import readme from "../../../README.md?raw";

const at = (s: string): number => { const i = readme.indexOf(s); expect(i, `missing: ${s}`).toBeGreaterThan(-1); return i; };

describe("README leads with sponsor lift", () => {
  it("has the approved top block right under the H1 and badge, before 'Who pays and why'", () => {
    const order = ["# Tour Intelligence × Qloo", "[![test]", "**Route with anything. Win every city with this.**", "In Los Angeles, Mac DeMarco's fans rank Stüssy #1; it isn't in LA's overall top 20. That gap is the sponsor pitch.", "Qloo ranked the real tour's pick above a popularity baseline 17–1 (4 ties, p<0.001), and the claim checker caught 10 of 10 planted false claims.", "Who pays and why"].map(at);
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
});
