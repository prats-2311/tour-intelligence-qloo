import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import type { City } from "../src/geo/cities.js";
import type { QlooCaller } from "../src/qlooCall.js";
import { executeTool } from "../src/strategist/tools.js";
import { runStrategist } from "../src/strategist/run.js";

const CITIES: City[] = [
  { id: "a", name: "Nashville", country: "US", lat: 36.16, lon: -86.78, population: 690_000 },
  { id: "b", name: "Atlanta", country: "US", lat: 33.75, lon: -84.39, population: 500_000 },
  { id: "c", name: "Asheville", country: "US", lat: 35.6, lon: -82.55, population: 94_000 },
  { id: "d", name: "Arden", country: "US", lat: 35.47, lon: -82.52, population: 30_000 },
];
const envelope = (pts: Array<[number, number, number]>) => ({
  operation: "where_popular", status: "ok", summary: "10 results",
  results: pts.map(([latitude, longitude, affinity]) => ({ location: { latitude, longitude }, query: { affinity, popularity: 0.2 } })),
});
const qlooOf = (env: unknown): QlooCaller => ({ call: vi.fn(async () => ({ envelope: env, cacheKey: "k", cached: false, stale: false })) }) as unknown as QlooCaller;
const run = (env: unknown) => executeTool({ name: "qloo_where_popular", args: { entity: "Ed Sheeran", within: "United States" } }, { qloo: qlooOf(env), cities: CITIES, sessionId: "s" });

describe("qloo_where_popular for the strategist", () => {
  const env = envelope([[36.15, -86.8, 0.9], [33.8, -84.4, 0.7], [35.57, -82.55, 0.5], [35.58, -82.5, 0.8], [0, -30, 0.4]]);
  it("labels points with cities and drops lat/lon", async () => {
    const r = await run(env);
    const json = JSON.stringify(r.data);
    expect(json).not.toMatch(/latitude|longitude|"lat"|"lon"|location/);
    const d = r.data as { cities: Array<{ city: string; country: string; affinity: number }>; points: Array<{ city: string | null }> };
    expect(d.cities.map((c) => c.city)).toEqual(["Nashville", "Asheville", "Atlanta"]);
    expect(d.cities[0]).toMatchObject({ city: "Nashville", country: "US", affinity: 0.9 });
    expect(d.cities.find((c) => c.city === "Asheville")!.affinity).toBe(0.8); // deduped, max affinity
  });
  it("labels a far-ocean point null", async () => {
    const d = (await run(env)).data as { points: Array<{ city: string | null }> };
    expect(d.points.some((p) => p.city === null)).toBe(true);
  });
  it("names the top cities in the summary", async () => {
    expect((await run(env)).summary).toContain("Top: Nashville, Asheville, Atlanta");
  });
  it("collected data has no coordinates for the number checker", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ functionCall: { name: "qloo_where_popular", args: { entity: "Ed Sheeran", within: "United States" } } }] } }] })
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "Top is Nashville." }] } }] });
    const sent = JSON.stringify(await (async () => {
      const evs = [] as unknown[];
      for await (const e of runStrategist({ messages: [{ role: "user", text: "x" }], context: {}, sessionId: "s" }, { generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: qlooOf(env), cities: CITIES })) evs.push(e);
      return generate.mock.calls[1]![1];
    })());
    expect(sent).toContain("Nashville");
    expect(sent).not.toMatch(/latitude|longitude/);
  });
  it("system prompt forbids coordinates", () => {
    expect(readFileSync(new URL("../src/strategist/run.ts", import.meta.url), "utf8")).toContain("Never give coordinates; name cities. If there is no board yet, suggest filling in the Plan a tour form (artist, regions or pasted cities) and pressing Score markets for the full city scores.");
  });
});
