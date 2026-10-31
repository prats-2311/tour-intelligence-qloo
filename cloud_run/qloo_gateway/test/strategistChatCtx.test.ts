import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import type { City } from "../src/geo/cities.js";
import type { GeminiResponse } from "../src/narrative/gemini.js";
import type { CallResult, QlooCaller } from "../src/qlooCall.js";
import { parseAgeGroup } from "../src/strategist/ageGroup.js";
import { unsupportedNumbers } from "../src/strategist/answerCheck.js";
import { runStrategist } from "../src/strategist/run.js";
import { validateContext } from "../src/strategist/safety.js";
import { executeTool, STRATEGIST_DECLARATIONS } from "../src/strategist/tools.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";

const CITIES: City[] = [{ id: "1", name: "Madrid", country: "ES", lat: 40.4168, lon: -3.7038, population: 3_200_000 }];
const wrap = (envelope: QlooEnvelope): CallResult => ({ envelope, cacheKey: "k", cached: false, stale: false });
const demo: QlooEnvelope = { operation: "audience_demographics", status: "ok", results: [{ entity_id: "ART", query: { age: { "25_to_29": 0.9, "24_and_younger": 0.1 } } }] };
const brands = (n: string): QlooEnvelope => ({ operation: "recommend", status: "ok", results: [{ entity_id: `${n}1`, name: `Brand ${n}1`, affinity: 0.9, popularity: 0.5 }, { entity_id: `${n}2`, name: `Brand ${n}2`, affinity: 0.8, popularity: 0.5 }, { entity_id: "x", name: "Red Cross", affinity: 0.7, popularity: 0.5 }] });
const madridHeat: QlooEnvelope = { operation: "where_popular", status: "ok", results: [{ location: { latitude: 40.42, longitude: -3.7 }, query: { affinity: 0.6, popularity: 0.2 } }, { location: { latitude: 40.43, longitude: -3.69 }, query: { affinity: 0.3, popularity: 0.2 } }, { location: { latitude: 40.40, longitude: -3.72 }, query: { affinity: 0.1, popularity: 0.2 } }] };
function fake() {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const qloo: QlooCaller = {
    async call(tool, args) {
      calls.push({ tool, args });
      if (tool === "qloo_where_popular") return wrap(madridHeat);
      if (tool === "qloo_audience_demographics") return wrap(demo);
      return wrap(Array.isArray(args.signals) ? brands("S") : brands("C"));
    },
  };
  return { qloo, calls };
}
const BOARD = { name: "Bad Bunny", entityId: "ART" };
const deps = (qloo: QlooCaller, artist = BOARD) => ({ qloo, cities: CITIES, sessionId: "s", artist });

describe("artist identity defaults", () => {
  it("fills qloo_recommend signals with the board artist id when the model omits them", async () => {
    const f = fake();
    await executeTool({ name: "qloo_recommend", args: { target_type: "brand", signal_location: "Madrid, ES" } }, deps(f.qloo));
    expect(f.calls[0]!.args.signals).toEqual(["ART"]);
  });
  it("replaces a name matching the board artist with the id", async () => {
    const f = fake();
    await executeTool({ name: "qloo_recommend", args: { target_type: "brand", signals: ["bad bunny"] } }, deps(f.qloo));
    expect(f.calls[0]!.args.signals).toEqual(["ART"]);
    await executeTool({ name: "qloo_audience_demographics", args: { entity: "Bad Bunny" } }, deps(f.qloo));
    expect(f.calls[1]!.args.entity).toBe("ART");
    await executeTool({ name: "qloo_audience_demographics", args: {} }, deps(f.qloo));
    expect(f.calls[2]!.args.entity).toBe("ART");
  });
  it("leaves other entities alone and does nothing without a board artist", async () => {
    const f = fake();
    await executeTool({ name: "qloo_recommend", args: { target_type: "brand", signals: ["Rosalia"] } }, deps(f.qloo));
    expect(f.calls[0]!.args.signals).toEqual(["Rosalia"]);
    await executeTool({ name: "qloo_recommend", args: { target_type: "brand" } }, { qloo: f.qloo, cities: CITIES, sessionId: "s" });
    expect(f.calls[1]!.args.signals).toBeUndefined();
  });
  it("get_city_playbook defaults artist and id from the board", async () => {
    const f = fake();
    const r = await executeTool({ name: "get_city_playbook", args: { city: "Madrid", country: "ES" } }, deps(f.qloo));
    expect(r.status).not.toBe("rejected");
  });
  it("system prompt names the artist and id and forbids asking which entity", async () => {
    const generate = vi.fn(async (): Promise<GeminiResponse> => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    const d = { generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: fake().qloo, cities: CITIES };
    for await (const _ of runStrategist({ messages: [{ role: "user", text: "hi" }], context: { artist: BOARD }, sessionId: "s" }, d)) void _;
    const sys = (generate.mock.calls[0] as unknown as [string, { systemInstruction: { parts: Array<{ text: string }> } }])[1].systemInstruction.parts[0]!.text;
    expect(sys).toContain("The artist is Bad Bunny with Qloo entity id ART");
    expect(sys).toMatch(/never ask the user which entity/i);
    expect(sys).toContain("25_to_29");
    expect(sys).toMatch(/sponsors_by_age/);
  });
  it("system prompt tells it to answer routing and risk questions from the board", async () => {
    const generate = vi.fn(async (): Promise<GeminiResponse> => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    const d = { generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: fake().qloo, cities: CITIES };
    for await (const _ of runStrategist({ messages: [{ role: "user", text: "route?" }], context: { artist: BOARD }, sessionId: "s" }, d)) void _;
    const sys = (generate.mock.calls[0] as unknown as [string, { systemInstruction: { parts: Array<{ text: string }> } }])[1].systemInstruction.parts[0]!.text;
    expect(sys).toMatch(/routing|prioriti[sz]/i);
    expect(sys).toMatch(/never say you cannot advise/i);
    expect(sys).toMatch(/distances? (are|is) not known/i);
    expect(sys).toMatch(/ticket sales/i);
    expect(sys).toMatch(/Close call/);
  });
  it("context validation accepts team status and flags, rejects a bad artist id", () => {
    const city = { id: "1", name: "Madrid", country: "ES", verdict: "play", fanHeat: 1, activation: 2, winnability: 3, teamStatus: "on_hold", closeCall: true, partialData: true, majorMarket: true };
    const ok = validateContext({ artist: BOARD, cities: [city] });
    expect(ok).toMatchObject({ ok: true, context: { cities: [{ teamStatus: "on_hold", closeCall: true, partialData: true, majorMarket: true }] } });
    expect(validateContext({ artist: { name: "X", entityId: "bad id!" } })).toMatchObject({ ok: false });
    const dropped = validateContext({ cities: [{ ...city, teamStatus: "<script>" }] });
    expect(dropped).toMatchObject({ ok: true, context: { cities: [{ id: "1" }] } });
    expect((dropped as { context: { cities: Array<Record<string, unknown>> } }).context.cities[0]!.teamStatus).toBeUndefined();
  });
});

describe("age groups", () => {
  it("maps user phrasings to Qloo buckets", () => {
    const m = (s: string) => parseAgeGroup(s);
    expect(m("25-29")).toBe("25_to_29");
    expect(m("25 to 29")).toBe("25_to_29");
    expect(m("25_to_29")).toBe("25_to_29");
    expect(m("fans in their late twenties")).toBe("25_to_29");
    expect(m("55+")).toBe("55_and_older");
    expect(m("18-24")).toBe("24_and_younger");
    expect(m("under 25")).toBe("24_and_younger");
    expect(m("35-44")).toBe("35_to_44");
    expect(m("30-34")).toBe("30_to_34");
    expect(m("45–54")).toBe("45_to_54");
    expect(m("banana")).toBeNull();
    expect(m("25-34")).toBeNull();
  });
  it("declares sponsors_by_age", () => {
    expect(STRATEGIST_DECLARATIONS.map((d) => d.name)).toContain("sponsors_by_age");
  });
  it("sponsors_by_age runs the segment pipeline for the mapped bucket with the segment demographic and filters non-sponsors", async () => {
    const f = fake();
    const r = await executeTool({ name: "sponsors_by_age", args: { city: "Madrid", country: "ES", age_group: "25-29" } }, deps(f.qloo));
    expect(r.summary).not.toMatch(/^No |couldn/);
    expect(r.status).toBe("ok");
    expect(f.calls.some((c) => c.args.demographic === "25-29")).toBe(true);
    expect(JSON.stringify(r.data)).toContain("Brand S1");
    expect(JSON.stringify(r.data)).not.toContain("Red Cross");
    expect(JSON.stringify(r.data)).toContain("25_to_29");
    expect(r.summary).toMatch(/vs the average audience, not a share/);
  });
  it("sponsors_by_age with an unknown group returns a helpful error listing buckets and does not call Qloo", async () => {
    const f = fake();
    const r = await executeTool({ name: "sponsors_by_age", args: { city: "Madrid", country: "ES", age_group: "banana" } }, deps(f.qloo));
    expect(r.status).toBe("rejected");
    for (const b of ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]) expect(r.summary).toContain(b);
    expect(f.calls).toHaveLength(0);
  });
  it("sponsors_by_age without a board artist is rejected helpfully", async () => {
    const f = fake();
    const r = await executeTool({ name: "sponsors_by_age", args: { city: "Madrid", country: "ES", age_group: "25-29" } }, { qloo: f.qloo, cities: CITIES, sessionId: "s" });
    expect(r.status).toBe("rejected");
  });
});

describe("number checker counts user text", () => {
  it("does not flag numbers the user wrote or the board context holds", () => {
    expect(unsupportedNumbers("For fans aged 25-29 the mix differs.", [], {}, [], ["Which brand, and is it different for fans aged 25-29?"])).toEqual([]);
  });
  it("still flags a number absent from tools, context and user text", () => {
    expect(unsupportedNumbers("For fans aged 25-29 expect 40 more.", [], {}, [], ["fans aged 25-29?"])).toEqual(["40"]);
  });
  it("run passes user messages into the check", async () => {
    const generate = vi.fn(async (): Promise<GeminiResponse> => ({ candidates: [{ content: { parts: [{ text: "Fans aged 25-29 differ." }] } }] }));
    const d = { generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: fake().qloo, cities: CITIES };
    const evs: GatewayEvent[] = [];
    for await (const e of runStrategist({ messages: [{ role: "user", text: "different for fans aged 25-29?" }], context: {}, sessionId: "s" }, d)) evs.push(e);
    expect(evs.find((e) => e.type === "strategist_message")).toMatchObject({ unsupportedNumbers: [] });
  });
});
