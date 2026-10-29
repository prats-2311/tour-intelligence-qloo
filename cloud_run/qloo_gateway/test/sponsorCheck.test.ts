import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { classifySponsors, type SponsorCandidate } from "../src/pipeline/sponsorCheck.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, recs } from "./fixtures/envelopes.js";

const answer = (json: unknown) => vi.fn(async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }));
const mkDeps = (generate?: ReturnType<typeof vi.fn>, cache = new MemoryCache()) => ({ ...(generate ? { generate } : {}), models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, cache });

// Seattle set: id = the brand's position in the recommend answer (recs() numbers entities E0, E1, ...).
const SEATTLE = ["ClickHole", "Costar", "Planned Parenthood", "Vice", "Color of Change", "The Onion", "ACLU", "Everytown for Gun Safety", "Black Lives Matter"];
const cands: SponsorCandidate[] = SEATTLE.map((name, i) => ({ entityId: `E${i}`, name }));
const MODEL_YES = new Set(["ClickHole", "Costar", "Vice", "The Onion"]);
const modelItems = (names: string[]) => ({ items: SEATTLE.flatMap((n, i) => (names.includes(n) ? [{ id: `E${i}`, sponsor: MODEL_YES.has(n) }] : [])) });

describe("classifySponsors", () => {
  it("returns the model's verdicts per id", async () => {
    const g = answer(modelItems(SEATTLE));
    const r = await classifySponsors(cands, "s", mkDeps(g));
    expect(r.available).toBe(true);
    expect([...r.verdicts].filter(([, v]) => v).map(([id]) => id)).toEqual(["E0", "E1", "E3", "E5"]);
    expect(g).toHaveBeenCalledTimes(1);
  });
  it("a cache hit makes no call; only uncached ids are asked", async () => {
    const cache = new MemoryCache();
    await classifySponsors(cands, "s", mkDeps(answer(modelItems(SEATTLE)), cache));
    const g2 = answer(modelItems(SEATTLE));
    const r = await classifySponsors(cands, "s2", mkDeps(g2, cache));
    expect(g2).not.toHaveBeenCalled();
    expect(r.available).toBe(true);
    expect(r.verdicts.get("E0")).toBe(true);
    expect(r.verdicts.get("E4")).toBe(false);
    const g3 = answer({ items: [{ id: "E99", sponsor: true }] });
    await classifySponsors([...cands, { entityId: "E99", name: "Vans" }], "s3", mkDeps(g3, cache));
    const prompt = JSON.stringify((g3.mock.calls[0] as unknown[])[1]);
    expect(prompt).toContain("E99");
    expect(prompt).not.toContain("E0\\\"");
  });
  it("errors are not cached and mark the check unavailable", async () => {
    const cache = new MemoryCache();
    const bad = vi.fn(async () => { throw new Error("boom"); });
    expect((await classifySponsors(cands, "s", mkDeps(bad, cache))).available).toBe(false);
    const g = answer(modelItems(SEATTLE));
    await classifySponsors(cands, "s", mkDeps(g, cache));
    expect(g).toHaveBeenCalledTimes(1);
  });
  it("unparseable or malformed answers are unavailable; no generate is unavailable", async () => {
    expect((await classifySponsors(cands, "s", mkDeps(answer({ nope: 1 })))).available).toBe(false);
    expect((await classifySponsors(cands, "s", mkDeps())).available).toBe(false);
  });
  it("a capped session is unavailable without calling Gemini", async () => {
    const g = answer(modelItems(SEATTLE));
    const d = { ...mkDeps(g), ceiling: { ceiling: new BudgetGuard({ perSession: 0, perDay: 300 }) } };
    expect((await classifySponsors(cands, "s", d)).available).toBe(false);
    expect(g).not.toHaveBeenCalled();
  });
});

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const qloo = (brands: string[]): QlooCaller => ({
  async call(tool, args) {
    const env = ((): QlooEnvelope => {
      if (tool === "qloo_where_popular") return cityHeat;
      if (tool === "qloo_recommend" && args.target_type === "brand" && args.signals) return recs(brands, brands.map((_, i) => 0.9 - i * 0.05));
      return recs(["X", "Y"], [0.7, 0.5]);
    })();
    return { envelope: env, cacheKey: `k${tool}${JSON.stringify(args).length}`, cached: false, stale: false };
  },
});
const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s", artistPopularity: 0.9 };
async function run(brands: string[], gen: ReturnType<typeof vi.fn>, cache = new MemoryCache()) {
  let narrated: unknown;
  const events: GatewayEvent[] = [];
  for await (const e of runCityPlaybook(input, {
    qloo: qloo(brands), cities: CITIES,
    sponsorCheck: (c, sid) => classifySponsors(c, sid, mkDeps(gen, cache)),
    narrate: async (x) => { narrated = x.cards; return { status: "unavailable", reason: "error", message: "n/a" }; },
  })) events.push(e);
  const cards = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; items: Array<{ name: string }>; summary?: Record<string, unknown> }> } }).playbook.cards;
  return { sponsors: cards.find((c) => c.kind === "sponsors")!, merch: cards.find((c) => c.kind === "merch")!, narrated };
}

describe("sponsor check in the city playbook", () => {
  it("Seattle: model answer plus list backstop keep the four brands and hide five organisations", async () => {
    // The model wrongly says yes to ACLU and Planned Parenthood and Black Lives Matter: the name list still hides them.
    const g = answer({ items: SEATTLE.map((n, i) => ({ id: `E${i}`, sponsor: MODEL_YES.has(n) || ["ACLU", "Planned Parenthood", "Black Lives Matter"].includes(n) })) });
    const { sponsors, merch, narrated } = await run(SEATTLE, g);
    expect(sponsors.items.map((i) => i.name).sort()).toEqual(["ClickHole", "Costar", "The Onion", "Vice"]);
    expect(sponsors.summary?.hiddenNonSponsors).toBe(5);
    expect(sponsors.summary?.sponsorCheck).toBeUndefined();
    expect((merch.summary?.brands as string[]).sort()).toEqual(["ClickHole", "Costar", "The Onion", "Vice"]);
    const text = JSON.stringify(narrated);
    for (const n of ["Color of Change", "Everytown", "ACLU", "Planned Parenthood", "Black Lives Matter"]) expect(text).not.toContain(n);
    const listed = JSON.stringify((g.mock.calls[0] as unknown[])[1]);
    expect(listed).not.toContain("ACLU"); // listed names are never sent to the model
  });
  it("an id missing from a successful answer is hidden", async () => {
    const g = answer({ items: [{ id: "E0", sponsor: true }, { id: "E1", sponsor: true }] }); // Vice (E3) and The Onion (E5) unanswered
    const { sponsors } = await run(["ClickHole", "Costar", "Vice"], g);
    expect(sponsors.items.map((i) => i.name)).toEqual(["ClickHole", "Costar"]);
    expect(sponsors.summary?.hiddenNonSponsors).toBe(1);
    expect(sponsors.summary?.sponsorCheck).toBeUndefined();
  });
  it("a whole-call error falls back to the name list and marks the check unavailable", async () => {
    const g = vi.fn(async () => { throw new Error("boom"); });
    const { sponsors } = await run(["ClickHole", "ACLU", "Color of Change"], g);
    expect(sponsors.items.map((i) => i.name)).toEqual(["ClickHole", "Color of Change"]);
    expect(sponsors.summary?.hiddenNonSponsors).toBe(1);
    expect(sponsors.summary?.sponsorCheck).toBe("unavailable");
  });
  it("a second build with every id cached makes no call", async () => {
    const cache = new MemoryCache();
    const g1 = answer({ items: [{ id: "E0", sponsor: true }, { id: "E1", sponsor: false }] });
    await run(["ClickHole", "Everytown for Gun Safety"], g1, cache);
    const g2 = answer({ items: [] });
    const { sponsors } = await run(["ClickHole", "Everytown for Gun Safety"], g2, cache);
    expect(g2).not.toHaveBeenCalled();
    expect(sponsors.items.map((i) => i.name)).toEqual(["ClickHole"]);
  });
  it("without a sponsor check the name list alone applies and nothing is marked", async () => {
    const events: GatewayEvent[] = [];
    for await (const e of runCityPlaybook(input, { qloo: qloo(["ClickHole", "ACLU"]), cities: CITIES })) events.push(e);
    const cards = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; items: Array<{ name: string }>; summary?: Record<string, unknown> }> } }).playbook.cards;
    const s = cards.find((c) => c.kind === "sponsors")!;
    expect(s.items.map((i) => i.name)).toEqual(["ClickHole"]);
    expect(s.summary?.sponsorCheck).toBeUndefined();
  });
});
