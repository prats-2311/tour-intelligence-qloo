import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import { createApp } from "../src/http/app.js";
import type { City } from "../src/geo/cities.js";
import type { CallResult, QlooCaller } from "../src/qlooCall.js";
import type { QlooEnvelope } from "../src/types.js";
import { SPONSORS_PROMPT_VERSION, compareSponsorsWithoutQloo, sponsorsPrompt } from "../src/sponsorsWithoutQloo.js";
import { cityHeat } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const IN = { artist: "Lumen Vale", artistId: "ART", city: { name: "Mexico City", country: "MX" }, sessionId: "s" };
const wrap = (envelope: QlooEnvelope): CallResult => ({ envelope, cacheKey: "k", cached: false, stale: false });
const brandEnv = (names: string[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results: names.map((name, i) => ({ entity_id: `E${name}`, name, affinity: 1 - i / 100, popularity: 0.5 })) });
/** 50 fan brands: "Fan1".."Fan50", with a few real names placed at known ranks. */
const FAN = Array.from({ length: 50 }, (_, i) => `Fan${i + 1}`);
FAN[13] = "Café Nero"; // rank 14
FAN[1] = "Coca-Cola"; // rank 2
const CITYB = Array.from({ length: 20 }, (_, i) => `City${i + 1}`);
CITYB[4] = "Coca-Cola"; // city rank 5
CITYB[10] = "Fan1"; // Qloo's pick; city rank 11

function fakeQloo(opts: { fan?: string[]; city?: string[]; describe?: (entity: string) => QlooEnvelope } = {}) {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const qloo: QlooCaller = {
    async call(tool, args) {
      calls.push({ tool, args });
      if (tool === "qloo_where_popular") return wrap(cityHeat);
      if (tool === "qloo_describe") return wrap(opts.describe ? opts.describe(String(args.entity)) : { operation: "describe", status: "empty", results: [] });
      if (tool === "qloo_recommend") return wrap(brandEnv(Array.isArray(args.signals) ? opts.fan ?? FAN : opts.city ?? CITYB));
      throw new Error(`unexpected ${tool}`);
    },
  };
  return { qloo, calls };
}
const gem = (brands: unknown) => vi.fn(async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ brands }) }] } }] }));
const mkDeps = (generate: ReturnType<typeof vi.fn> | undefined, q = fakeQloo(), perSession = 20) => ({
  qloo: q.qloo, cities: CITIES, ...(generate ? { generate } : {}), models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession, perDay: 300 }) }, cache: new MemoryCache(),
});

describe("compareSponsorsWithoutQloo", () => {
  it("sends the fixed prompt at temperature 0.2 with a 5-brand schema", async () => {
    const g = gem(["Coca-Cola", "Nike", "Red Bull", "Pepsi", "Visa"]);
    await compareSponsorsWithoutQloo(IN, mkDeps(g));
    const body = g.mock.calls[0]![1] as { contents: Array<{ parts: Array<{ text: string }> }>; generationConfig: Record<string, unknown> };
    expect(body.contents[0]!.parts[0]!.text).toBe("You are advising a concert promoter. Without looking anything up, list the 5 brands most likely to sponsor or partner with Lumen Vale's concert in Mexico City, MX, best first. Brands only, no organisations.");
    expect(body.contents[0]!.parts[0]!.text).toBe(sponsorsPrompt("Lumen Vale", "Mexico City", "MX"));
    expect(body.generationConfig).toMatchObject({ temperature: 0.2, responseMimeType: "application/json" });
    expect(JSON.stringify(body.generationConfig)).toContain("brands");
  });

  it("places picks on the fans' top 50 by case- and accent-insensitive name, null when absent", async () => {
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["Coke", "COCA-COLA", "CAFE NERO", "Nike", "Fan50"])));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.brands.map((b) => [b.name, b.fanRank])).toEqual([["Coke", null], ["COCA-COLA", 2], ["CAFE NERO", 14], ["Nike", null], ["Fan50", 50]]);
    expect(r.brands[1]!.cityRank).toBe(5);
    expect(r.brands[3]!.cityRank).toBeNull();
    expect(r.model).toBe("m");
    expect(r.prompt).toContain("Without looking anything up");
    expect(r.note).toBe("Measured on Qloo's own fan ranking: this shows how far a model's memory strays from these fans' taste, not that the ranking is right.");
  });

  it("reports the sponsors card's #1 (the playbook's own lift ordering over the fans' top 10) with its real fan and city rank", async () => {
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["A", "B", "C", "D", "E"])));
    if (r.status !== "ok") throw new Error("not ok");
    // Fan3: fan rank 3, not in the city's top 20 -> the largest lift among the fans' first 10.
    expect(r.qlooTop).toEqual({ name: "Fan3", fanRank: 3, cityRank: null });
  });
  it("without a full city baseline the card keeps Qloo's order, so the top pick is the fans' #1", async () => {
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["A", "B", "C", "D", "E"]), fakeQloo({ city: CITYB.slice(0, 5) })));
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.qlooTop).toEqual({ name: "Fan1", fanRank: 1, cityRank: null });
  });
  it("matches ignoring punctuation too", async () => {
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["coca cola", "Fan3", "Fan4", "Fan5", "Fan6"])));
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.brands[0]!.fanRank).toBe(2);
  });

  it("asks Qloo for 20 fan brands (the per-call cap), and the card's city baseline of 20", async () => {
    const q = fakeQloo();
    await compareSponsorsWithoutQloo(IN, mkDeps(gem(["A", "B", "C", "D", "E"]), q));
    const recs = q.calls.filter((c) => c.tool === "qloo_recommend");
    expect(recs.find((c) => Array.isArray(c.args.signals))!.args).toMatchObject({ target_type: "brand", signals: ["ART"], limit: 20 });
    expect(recs.find((c) => !Array.isArray(c.args.signals))!.args).toMatchObject({ target_type: "brand", limit: 20 });
  });

  it("marks non-sponsors instead of dropping them, and gives them no rank", async () => {
    const fan = [...FAN]; fan[6] = "Red Cross";
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["Red Cross", "Nike", "Coca-Cola", "Pepsi", "Visa"]), fakeQloo({ fan })));
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.brands).toHaveLength(5);
    expect(r.brands[0]).toMatchObject({ name: "Red Cross", nonSponsor: true, fanRank: null });
    expect(r.brands[1]!.nonSponsor).toBeUndefined();
  });

  it("falls back to a Qloo describe lookup for unmatched names, at most 5, and matches by entity id", async () => {
    const q = fakeQloo({ describe: (e) => (e === "Cafe de Nero" ? { operation: "describe", status: "ok", results: [{ entity_id: "ECafé Nero", name: "Café Nero" }] } : { operation: "describe", status: "empty", results: [] }) });
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["Cafe de Nero", "X1", "X2", "X3", "X4"]), q));
    if (r.status !== "ok") throw new Error("not ok");
    expect(r.brands[0]!.fanRank).toBe(14);
    expect(q.calls.filter((c) => c.tool === "qloo_describe")).toHaveLength(5);
    expect(r.brands.slice(1).every((b) => b.fanRank === null)).toBe(true);
  });

  it("starts the Qloo lookups while the model is still answering (picks do not gate them)", async () => {
    const q = fakeQloo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const g = vi.fn(async () => { await gate; return { candidates: [{ content: { parts: [{ text: JSON.stringify({ brands: ["A", "B", "C", "D", "E"] }) }] } }] }; });
    const p = compareSponsorsWithoutQloo(IN, mkDeps(g, q));
    await vi.waitFor(() => expect(q.calls.filter((c) => c.tool === "qloo_recommend")).toHaveLength(2));
    release();
    expect((await p).status).toBe("ok");
  });
  it("runs the describe lookups concurrently and keeps the picks' order", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    let inflight = 0, peak = 0;
    const qloo: QlooCaller = {
      async call(tool, args) {
        calls.push({ tool, args });
        if (tool === "qloo_where_popular") return wrap(cityHeat);
        if (tool === "qloo_recommend") return wrap(brandEnv(Array.isArray(args.signals) ? FAN : CITYB));
        inflight++; peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 15));
        inflight--;
        return wrap({ operation: "describe", status: "empty", results: [] });
      },
    };
    const r = await compareSponsorsWithoutQloo(IN, mkDeps(gem(["A", "B", "C", "D", "E"]), { qloo, calls }));
    if (r.status !== "ok") throw new Error("not ok");
    expect(peak).toBe(5);
    expect(r.brands.map((b) => b.name)).toEqual(["A", "B", "C", "D", "E"]);
  });
  it("does not describe a matched name", async () => {
    const q = fakeQloo();
    await compareSponsorsWithoutQloo(IN, mkDeps(gem(["Coca-Cola", "Fan3", "Fan4", "Fan5", "Fan6"]), q));
    expect(q.calls.filter((c) => c.tool === "qloo_describe")).toHaveLength(0);
  });

  it("caches per artist, city and prompt version: the second call makes no model or Qloo call", async () => {
    const g = gem(["Coca-Cola", "Nike", "Red Bull", "Pepsi", "Visa"]);
    const q = fakeQloo();
    const d = mkDeps(g, q);
    const first = await compareSponsorsWithoutQloo(IN, d);
    const qCalls = q.calls.length;
    const again = await compareSponsorsWithoutQloo(IN, d);
    expect(g).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ status: "ok", cached: true });
    expect(first).toMatchObject({ cached: false });
    expect(q.calls.length).toBe(qCalls);
    expect(SPONSORS_PROMPT_VERSION).toBeTruthy();
    // a different city is a different key
    await compareSponsorsWithoutQloo({ ...IN, city: { name: "Mexico City", country: "MX" }, artist: "Other" }, d);
    expect(g).toHaveBeenCalledTimes(2);
  });

  it("retries once on invalid JSON, then reports invalid", async () => {
    const bad = vi.fn(async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ brands: ["only", "two"] }) }] } }] }));
    expect(await compareSponsorsWithoutQloo(IN, mkDeps(bad))).toMatchObject({ status: "unavailable", reason: "invalid" });
    expect(bad).toHaveBeenCalledTimes(2);
    const flaky = vi.fn()
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: "not json" }] } }] })
      .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: JSON.stringify({ brands: ["a", "b", "c", "d", "e"] }) }] } }] });
    expect(await compareSponsorsWithoutQloo(IN, mkDeps(flaky))).toMatchObject({ status: "ok" });
  });

  it("maps budget and ceiling errors, a missing model and a Qloo budget stop to unavailable", async () => {
    expect(await compareSponsorsWithoutQloo(IN, mkDeps(gem(["a", "b", "c", "d", "e"]), fakeQloo(), 0))).toMatchObject({ status: "unavailable", reason: "capped" });
    expect(await compareSponsorsWithoutQloo(IN, mkDeps(undefined))).toMatchObject({ status: "unavailable", reason: "disabled" });
    const budgetQloo: QlooCaller = { call: async () => wrap({ operation: "x", status: "error", error: { code: "BUDGET" }, summary: "session budget exhausted", results: [] } as unknown as QlooEnvelope) };
    expect(await compareSponsorsWithoutQloo(IN, { ...mkDeps(gem(["a", "b", "c", "d", "e"])), qloo: budgetQloo })).toMatchObject({ status: "unavailable", reason: "capped" });
  });
});

describe("sponsors-without-qloo route", () => {
  const base = { qloo: fakeQloo().qloo, cities: CITIES, health: async () => ({ connected: true, ready: true }) };
  const q = "artist=Lumen%20Vale&city=Mexico%20City&country=MX&artistId=ART&cityId=1&lat=19.4&lon=-99.1";
  it("validates, forwards and passes the result through", async () => {
    const sponsorsWithoutQloo = vi.fn(async () => ({ status: "ok" as const }));
    const app = createApp({ ...base, sponsorsWithoutQloo } as never);
    expect((await request(app).get(`/v1/sponsors-without-qloo?${q}`)).status).toBe(400);
    expect((await request(app).get("/v1/sponsors-without-qloo?artist=%3Cscript%3E&city=A&country=MX&artistId=ART").set("x-session-id", "s")).status).toBe(400);
    expect((await request(app).get("/v1/sponsors-without-qloo?city=A&country=MX&artistId=ART").set("x-session-id", "s")).status).toBe(400);
    expect((await request(app).get("/v1/sponsors-without-qloo?artist=A&city=A&country=MX&artistId=ART&lat=abc").set("x-session-id", "s")).status).toBe(400);
    expect(sponsorsWithoutQloo).not.toHaveBeenCalled();
    const ok = await request(app).get(`/v1/sponsors-without-qloo?${q}`).set("x-session-id", "s");
    expect(ok.body).toEqual({ status: "ok" });
    expect(sponsorsWithoutQloo).toHaveBeenCalledWith(expect.objectContaining({ artist: "Lumen Vale", artistId: "ART", sessionId: "s", city: { name: "Mexico City", country: "MX", id: "1", lat: 19.4, lon: -99.1 } }), expect.anything());
  });
  it("answers unavailable/disabled without the dep", async () => {
    const res = await request(createApp(base)).get(`/v1/sponsors-without-qloo?${q}`).set("x-session-id", "s");
    expect(res.body).toMatchObject({ status: "unavailable", reason: "disabled" });
  });
});

describe("Qloo argument limits", () => {
  it("every qloo_recommend call passes the gateway validator (limit 1-20)", async () => {
    const { validateToolCall } = await import("../src/validate.js");
    const q = fakeQloo();
    await compareSponsorsWithoutQloo(IN, mkDeps(gem(["Coke", "Nike"]), q));
    const recs = q.calls.filter((c) => c.tool === "qloo_recommend");
    expect(recs.length).toBeGreaterThan(0);
    for (const c of recs) expect(validateToolCall(c.tool, c.args)).toMatchObject({ ok: true });
  });
});
