import { describe, expect, it } from "vitest";

const files = import.meta.glob("../../e2e/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (name: string): string => files[`../../e2e/${name}`] ?? "";
const specs = Object.keys(files).map((k) => k.split("/").pop()!).filter((f) => f.endsWith(".spec.ts"));

// Our own e2e traffic must not count as usage in the gateway's BigQuery analytics: every spec takes `test` from ./fixtures, whose context
// fixture sets localStorage tiq.test=1 before any page script runs (the client then sends x-tiq-test: 1 and an e2e- session id).
describe("e2e specs mark test traffic", () => {
  it("finds the specs", () => expect(specs.length).toBeGreaterThan(10));
  for (const f of specs) {
    it(`${f} imports test from ./fixtures, not @playwright/test`, () => {
      const src = read(f);
      expect(src).not.toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/);
      expect(src).toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"\.\/fixtures"/);
    });
  }
  it("the fixture sets tiq.test=1 on every context and freshBrowser keeps it", () => {
    const fx = read("fixtures.ts");
    expect(fx).toMatch(/tiq\.test/);
    expect(fx).toMatch(/context:\s*async/);
    expect(read("live.ts")).toMatch(/tiq\.test/);
  });
  it("contexts a spec creates itself are marked too", () => {
    const src = read("collab.spec.ts");
    expect(src).toMatch(/markTestTraffic\(ctx\)/);
  });
});
