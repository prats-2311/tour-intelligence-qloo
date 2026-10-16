import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import { rankWithoutQloo } from "../src/withoutQloo.js";

const cities = [{ name: "Mexico City", country: "MX" }, { name: "Guadalajara", country: "MX" }, { name: "São Paulo", country: "BR" }];
const answer = (ranked: unknown) => vi.fn(async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ranked }) }] } }] }));
const deps = (generate?: ReturnType<typeof vi.fn>, perSession = 20) => ({ ...(generate ? { generate } : {}), models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession, perDay: 300 }) }, cache: new MemoryCache() });
const input = { artist: "Lumen Vale", regions: ["Mexico", "Brazil"], cities, sessionId: "s" };

describe("rankWithoutQloo", () => {
  it("accepts a permutation of the given cities", async () => {
    const r = await rankWithoutQloo(input, deps(answer([cities[2], cities[0], cities[1]])));
    expect(r).toMatchObject({ status: "ok", cached: false, ranked: [cities[2], cities[0], cities[1]] });
  });
  it.each([
    ["an extra city", [...cities, { name: "Lima", country: "PE" }]],
    ["a missing city", cities.slice(0, 2)],
    ["a duplicate", [cities[0], cities[0], cities[1]]],
    ["not a list", "Mexico City"],
  ])("rejects %s as invalid", async (_label, ranked) => {
    expect(await rankWithoutQloo(input, deps(answer(ranked)))).toEqual({ status: "unavailable", reason: "invalid", message: "Generic ranking unavailable" });
  });
  it("never sends taste data: the prompt holds only names, artist and regions", async () => {
    const g = answer(cities);
    await rankWithoutQloo(input, deps(g));
    const prompt = JSON.stringify(g.mock.calls[0]![1]);
    expect(prompt).not.toMatch(/affinity|winnability|fan heat|activation/i);
    expect(prompt).toContain("Use only the cities listed");
  });
  it("caches an ok ranking and reports capped / disabled honestly", async () => {
    const g = answer(cities);
    const d = deps(g);
    await rankWithoutQloo(input, d);
    const again = await rankWithoutQloo(input, d);
    expect(again.status === "ok" && again.cached).toBe(true);
    expect(g).toHaveBeenCalledTimes(1);
    expect(await rankWithoutQloo(input, deps(answer(cities), 0))).toMatchObject({ status: "unavailable", reason: "capped", message: "Generic ranking limit reached" });
    expect(await rankWithoutQloo(input, deps())).toMatchObject({ status: "unavailable", reason: "disabled" });
  });
});
