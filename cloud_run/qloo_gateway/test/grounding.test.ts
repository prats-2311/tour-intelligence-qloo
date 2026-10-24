import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  askLlm, buildRows, CAPS, EXPECTED_CITIES, extractQlooItems, llmPrompt, runGrounding, selectCities, LLM_SCHEMA,
  type GroundCity, type GroundDeps,
} from "../src/backtest/grounding.js";
import * as cli from "../src/backtest/groundingCli.js";
import type { CliIo } from "../src/backtest/proofCli.js";
import { REPO_ROOT } from "../src/backtest/proofCli.js";
import { sha256Hex, StopMonitor } from "../src/backtest/proofStats.js";
import type { GenerateFn } from "../src/narrative/gemini.js";
import type { City } from "../src/geo/cities.js";
import type { QlooEnvelope } from "../src/types.js";
import { cityHeat, placesIn, recs } from "./fixtures/envelopes.js";

const scored = (id: string, name: string, country: string, fan: number | null, win: number | null) => ({
  type: "city_scored", city: { id, name, country, lat: 1, lon: 2, fanHeat: { value: fan }, winnability: { value: win }, verdict: "play" },
});
const showcase = (cities: ReturnType<typeof scored>[]) => ({
  artist: "Test Artist",
  boardEvents: [{ type: "resolve", entity: { entityId: "00000000-aaaa-0000-0000-000000000001", name: "Test Artist" } }, { type: "tool_result" }, ...cities, { type: "done" }],
});
const twelve = Array.from({ length: 12 }, (_, i) => scored(String(100 + i), `Town ${i}`, "MX", 50 + i, 20 + i));

const genText = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] });

describe("selectCities", () => {
  it("keeps cities with both scores, orders by sha256(city id) ascending, caps at 10", () => {
    const withGaps = [...twelve, scored("900", "NoWin", "MX", 60, null), scored("901", "NoFan", "MX", null, 30)];
    const sel = selectCities(showcase(withGaps));
    expect(sel.cities).toHaveLength(10);
    const expected = twelve.map((c) => c.city.id).sort((a, b) => (sha256Hex(a) < sha256Hex(b) ? -1 : 1)).slice(0, 10);
    expect(sel.cities.map((c) => c.id)).toEqual(expected);
    expect(sel.cities.map((c) => c.name)).not.toContain("NoWin");
    expect(sel.artist).toEqual({ name: "Test Artist", entityId: "00000000-aaaa-0000-0000-000000000001" });
  });
  it("reports the difference from the protocol's expected nine (the recorded board wins)", () => {
    const sel = selectCities(showcase(twelve));
    expect(sel.difference.missing.sort()).toEqual([...EXPECTED_CITIES].sort());
    expect(sel.difference.extra.length).toBe(10);
    const names = ["Portland", "Austin", "Los Angeles", "New York City", "Mexico City", "Guadalajara", "Sao Paulo", "Salvador", "Fortaleza"];
    const same = selectCities(showcase(names.map((n, i) => scored(String(i + 1), n, "US", 60, 30))));
    expect(same.difference).toEqual({ missing: [], extra: [] });
  });
  it("refuses a recording with no resolved artist", () => {
    expect(() => selectCities({ artist: "x", boardEvents: twelve })).toThrow(/artist/);
  });
});

describe("extractQlooItems", () => {
  const item = (name: string) => ({ name, entityId: "00000000-x" });
  const cards = [
    { kind: "sponsors", items: ["B1", "B2", "B3", "B4", "B5", "B6"].map(item) },
    { kind: "merch", items: [item("M1")] },
    { kind: "venue_fit", items: ["V1", "V2", "V3"].map(item) },
    { kind: "talent", items: ["T1", " ", "T2", "T3", "T4", "T5"].map(item) },
  ];
  it("takes venues, brands and local acts in card order, capped at 4, 4 and 3", () => {
    expect(CAPS).toEqual({ venue: 4, brand: 4, local_act: 3 });
    expect(extractQlooItems(cards as never)).toEqual({ venue: ["V1", "V2", "V3"], brand: ["B1", "B2", "B3", "B4"], local_act: ["T1", "T2", "T3"] });
  });
  it("records fewer items than the cap as they are, and tolerates missing cards", () => {
    expect(extractQlooItems([{ kind: "venue_fit", items: [item("Only")] }] as never)).toEqual({ venue: ["Only"], brand: [], local_act: [] });
  });
});

describe("LLM arm", () => {
  const monitor = () => new StopMonitor();
  it("uses the verbatim prompt and a schema of three capped string arrays at temperature 0.2", async () => {
    const bodies: Record<string, unknown>[] = [];
    const generate: GenerateFn = async (_m, body) => { bodies.push(body); return genText({ venues: ["V"], brands: ["B"], local_acts: ["T"] }); };
    const r = await askLlm({ artist: "Test Artist", city: "Testville", country: "Mexico" }, { generate, models: ["m1", "m2"], monitor: monitor() });
    expect(r).toEqual({ status: "ok", venue: ["V"], brand: ["B"], local_act: ["T"], model: "m1" });
    const text = ((bodies[0] as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]!.parts[0]!.text);
    expect(text).toBe("You are planning a concert in Testville, Mexico for Test Artist. List up to 4 real music venues in Testville, up to 4 real brands that could sponsor the show, and up to 3 real local artists from Testville who could open. Only names that exist in Testville.");
    expect(text).toBe(llmPrompt("Test Artist", "Testville", "Mexico"));
    const cfg = (bodies[0] as { generationConfig: { temperature: number; responseMimeType: string; responseSchema: unknown } }).generationConfig;
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.responseSchema).toEqual(LLM_SCHEMA);
    const props = (LLM_SCHEMA as { properties: Record<string, { type: string; maxItems: number; items: { type: string } }> }).properties;
    expect([props.venues!.maxItems, props.brands!.maxItems, props.local_acts!.maxItems]).toEqual([4, 4, 3]);
    expect(props.venues!.items.type).toBe("STRING");
  });
  it("caps over-long answers, trims, drops blanks and repeats", async () => {
    const generate: GenerateFn = async () => genText({ venues: ["A", " a ", "B", "", "C", "D", "E"], brands: [], local_acts: ["1", "2", "3", "4"] });
    const r = await askLlm({ artist: "x", city: "c", country: "k" }, { generate, models: ["m"], monitor: monitor() });
    expect(r).toMatchObject({ status: "ok", venue: ["A", "B", "C", "D"], brand: [], local_act: ["1", "2", "3"] });
  });
  it("retries invalid JSON or a wrong shape once, then records no answer", async () => {
    let calls = 0;
    const generate: GenerateFn = async () => { calls += 1; return genText(calls === 1 ? "not json" : { venues: "oops" }); };
    const r = await askLlm({ artist: "x", city: "c", country: "k" }, { generate, models: ["m"], monitor: monitor() });
    expect(r.status).toBe("no_answer");
    expect(calls).toBe(2);
    let n = 0;
    const second: GenerateFn = async () => { n += 1; return genText(n === 1 ? { venues: [1] } : { venues: ["V"], brands: [], local_acts: [] }); };
    expect(await askLlm({ artist: "x", city: "c", country: "k" }, { generate: second, models: ["m"], monitor: monitor() })).toMatchObject({ status: "ok", venue: ["V"] });
    expect(n).toBe(2);
  });
  it("stops the run when every Gemini model fails after its retries", async () => {
    const m = monitor();
    const generate: GenerateFn = async () => { throw new Error("Vertex 400"); };
    await expect(askLlm({ artist: "x", city: "c", country: "k" }, { generate, models: ["a", "b"], monitor: m })).rejects.toThrow(/stopped/);
    expect(m.stopped).toMatch(/all Gemini models failed/);
  });
});

describe("buildRows", () => {
  const city = { cityId: "5", city: "Testville", country: "MX" };
  const it_ = (category: "venue" | "brand" | "local_act", arm: "qloo" | "llm", name: string, rank: number) => ({ ...city, category, arm, name, rank });
  it("de-duplicates per (city, category, normalised name) and credits both arms", () => {
    const rows = buildRows([
      it_("venue", "qloo", "Café Azul", 1), it_("venue", "llm", "cafe azul!", 2), it_("venue", "llm", "Other Hall", 1),
      it_("brand", "qloo", "Café Azul", 1), // same name, different category: separate row
      { ...it_("venue", "qloo", "Café Azul", 1), cityId: "6", city: "Elsewhere" }, // same name, different city
    ]);
    expect(rows).toHaveLength(4);
    const shared = rows.find((r) => r.category === "venue" && r.cityId === "5" && /azul/i.test(r.name))!;
    expect(shared.arms).toEqual(["llm", "qloo"]);
    expect(rows.filter((r) => r.arms.length === 1)).toHaveLength(3);
  });
  it("sorts by sha256(city + category + name) and numbers the rows in that order, independent of input order", () => {
    const items = [it_("venue", "qloo", "Alpha Hall", 1), it_("brand", "llm", "Beta Co", 1), it_("local_act", "qloo", "Gamma Band", 1), it_("venue", "llm", "Delta Arena", 2)];
    const a = buildRows(items);
    const b = buildRows([...items].reverse());
    expect(a).toEqual(b);
    const hashes = a.map((r) => sha256Hex(r.city + r.category + r.name));
    expect(hashes).toEqual([...hashes].sort());
    expect(a.map((r) => r.id)).toEqual(["r001", "r002", "r003", "r004"]);
  });
});

// A fake gateway for one real city, driven through the real playbook pipeline.
const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const proxies = (names: string[], affs: number[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results: names.map((name, i) => ({ entity_id: `P${i}`, name, affinity: affs[i] })) });
const compare: QlooEnvelope = { operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags: [] } };
const happy = (t: string, a: Record<string, unknown>): QlooEnvelope => {
  if (t === "qloo_where_popular") return cityHeat;
  if (t === "qloo_entity_tags") return { operation: "tags", status: "ok", results: [] };
  if (t === "qloo_recommend" && !a.signals) return proxies(["Proxy 1", "Proxy 2"], [0.7, 0.6]);
  if (t === "qloo_compare_audiences") return compare;
  if (t === "qloo_rank" && a.option_type === "artist") return proxies(["Proxy 2", "Proxy 1"], [0.95, 0.4]);
  if (t === "qloo_rank") return recs(["Venue A", "Venue B"], [0.8, 0.6]);
  if (t === "qloo_recommend" && a.target_type === "place") return placesIn(a.filter_location, ["Place 1", "Place 2", "Place 3", "Place 4"], [0.5, 0.9, 0.7, 0.8]);
  if (t === "qloo_recommend" && a.target_type === "brand") return recs(["Brand 1", "Brand 2", "Brand 3", "Brand 4", "Brand 5"], [0.9, 0.8, 0.7, 0.6, 0.5]);
  return recs(["X", "Y"], [0.7, 0.5]);
};
const city1: GroundCity = { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332 };
const plan = (cities: GroundCity[]) => ({ artist: { name: "Test Artist", entityId: "00000000-aaaa-0000-0000-000000000001" }, cities });
function deps(over: Partial<GroundDeps> = {}): GroundDeps & { sent: Array<{ tool: string; session: string }>; monitor: StopMonitor } {
  const sent: Array<{ tool: string; session: string }> = [];
  const monitor = new StopMonitor();
  const generate: GenerateFn = async (_m, body) => (JSON.stringify(body).includes('"venues"') ? genText({ venues: ["LV1", "LV2"], brands: ["LB1"], local_acts: ["LT1"] }) : genText({ items: [{ name: "Suggested Act" }] }));
  return {
    sent, monitor, cities: CITIES, generate, models: ["m1"], log: () => {}, sleep: async () => {},
    callTool: async (tool, args, session) => { sent.push({ tool, session }); return happy(tool, args); },
    ...over,
  } as never;
}

describe("runGrounding", () => {
  it("runs the real playbook per city (session proof-v3-ground-<id>, narrative off) and the LLM arm, recording items with ranks", async () => {
    const d = deps();
    const run = await runGrounding(plan([city1]), d);
    expect(run.stop).toBeUndefined();
    expect(d.sent.length).toBeGreaterThan(5);
    expect(new Set(d.sent.map((s) => s.session))).toEqual(new Set(["proof-v3-ground-1"]));
    const q = run.items.filter((i) => i.arm === "qloo");
    expect(q.filter((i) => i.category === "brand").map((i) => i.name)).toEqual(["Brand 1", "Brand 2", "Brand 3", "Brand 4"]);
    expect(q.filter((i) => i.category === "venue").length).toBeLessThanOrEqual(4);
    expect(q.filter((i) => i.category === "local_act").length).toBeLessThanOrEqual(3);
    expect(q.filter((i) => i.category === "brand").map((i) => i.rank)).toEqual([1, 2, 3, 4]);
    const l = run.items.filter((i) => i.arm === "llm");
    expect(l.map((i) => `${i.category}:${i.name}`)).toEqual(["venue:LV1", "venue:LV2", "brand:LB1", "local_act:LT1"]);
    expect(run.cityStatus[0]).toMatchObject({ cityId: "1", qloo: "ok", llm: "ok" });
    expect(run.items[0]).toMatchObject({ cityId: "1", city: "Mexico City", country: "MX" });
  });
  it("excludes a city whose playbook is LOCATION_UNRESOLVED and lists it, without spending the LLM call", async () => {
    let llmCalls = 0;
    const d = deps({ generate: async (_m, body) => { if (JSON.stringify(body).includes('"venues"')) llmCalls += 1; return genText({ items: [] }); },
      callTool: async (tool) => ({ operation: tool, status: "empty", results: [] }) });
    const run = await runGrounding(plan([city1]), d);
    expect(run.stop).toBeUndefined();
    expect(run.excluded).toEqual([expect.objectContaining({ cityId: "1", reason: expect.stringContaining("LOCATION_UNRESOLVED") })]);
    expect(run.items).toEqual([]);
    expect(llmCalls).toBe(0);
  });
  it("an LLM no-answer keeps the Qloo items and marks the city", async () => {
    const d = deps({ generate: async (_m, body) => (JSON.stringify(body).includes('"venues"') ? genText("garbage") : genText({ items: [] })) });
    const run = await runGrounding(plan([city1]), d);
    expect(run.cityStatus[0]).toMatchObject({ qloo: "ok", llm: "no_answer" });
    expect(run.items.every((i) => i.arm === "qloo")).toBe(true);
  });
  it("stops at once on a RATE error envelope: no further call, the partly done city is dropped, later cities are not run", async () => {
    let n = 0;
    const d = deps({ callTool: async (tool, args) => {
      n += 1;
      if (tool === "qloo_recommend") return { operation: tool, status: "error", summary: "rate limited", error: { code: "RATE", recovery: "retry later" }, results: null } as unknown as QlooEnvelope;
      return happy(tool, args);
    } });
    const run = await runGrounding(plan([city1, { ...city1, id: "2", name: "Second" }]), d);
    expect(run.stop).toMatch(/quota or limit|rate/i);
    expect(run.items).toEqual([]);
    expect(run.notRun.map((c) => c.cityId)).toEqual(["1", "2"]);
    expect(n).toBeGreaterThan(0);
  });
  it("stops before any city when the monitor has already stopped", async () => {
    const d = deps();
    d.monitor.halt("test stop");
    const run = await runGrounding(plan([city1]), d);
    expect(run.stop).toBe("test stop");
    expect(d.sent).toEqual([]);
  });
});

describe("Test C CLI", () => {
  const noNetwork: CliIo["makeClients"] = () => { throw new Error("network clients must not be built"); };
  const io = (): CliIo & { lines: string[] } => { const lines: string[] = []; return { lines, log: (l) => lines.push(l), env: {}, makeClients: noNetwork, now: () => new Date("2026-10-24T12:00:00Z") }; };
  it("--out-dir defaults under private-data/backtest and refuses tracked paths with no override", () => {
    const a = cli.parseArgs([]);
    expect(a.outDir).toBe(resolve(REPO_ROOT, "private-data/backtest"));
    expect(cli.outputPaths(a.outDir).items).toBe(resolve(REPO_ROOT, "private-data/backtest/proof-v3-ground-items.json"));
    expect(() => cli.parseArgs(["--out-dir", "docs"])).toThrow(/private-data/);
    expect(() => cli.parseArgs(["--out-dir", resolve(REPO_ROOT, "backtest"), "--allow-tracked"])).toThrow(/private-data/);
  });
  it("--dry-run prints the cities, the difference and the budget, and makes zero calls and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ground-"));
    const file = join(dir, "showcase.json");
    (await import("node:fs")).writeFileSync(file, JSON.stringify(showcase(twelve)));
    const i = io();
    const code = await cli.main(["--dry-run", "--showcase", file], i);
    expect(code).toBe(0);
    const text = i.lines.join("\n");
    expect(text).toMatch(/DRY RUN/);
    expect(text).toMatch(/10 cities/);
    expect(text).toMatch(/proof-v3-ground-100|proof-v3-ground-1\d\d/);
    expect(text).toMatch(/differ/i);
    expect(text).toMatch(/Qloo calls/);
  });
  it("the recorded showcase yields the expected nine when present (skipped when absent)", () => {
    const p = resolve(REPO_ROOT, "private-data/showcase.json");
    if (!existsSync(p)) return;
    const sel = selectCities(JSON.parse(readFileSync(p, "utf8")));
    expect(sel.cities.length).toBeLessThanOrEqual(10);
  });
});

describe("Gemini call accounting (Amendment 3)", () => {
  const isLlm = (body: unknown) => JSON.stringify(body).includes('"venues"');
  it("a clean run records exactly one LLM-arm Gemini call per city plus the local-acts calls, each counted once", async () => {
    let llm = 0, other = 0;
    const generate: GenerateFn = async (_m, body) => { if (isLlm(body)) { llm += 1; return genText({ venues: ["V"], brands: [], local_acts: [] }); } other += 1; return genText({ items: [{ name: "Suggested Act" }] }); };
    const d = deps({ generate });
    const cities = Array.from({ length: 9 }, (_, i) => ({ ...city1, id: String(i + 1), name: `Mexico City` }));
    const playbook = (async function* () { yield { type: "playbook", playbook: { city: {}, cards: [] } }; yield { type: "done", summary: {} }; }) as never;
    // the real pipeline for every city: reuse city 1's known id in the list
    const run = await runGrounding(plan(cities.map((c) => ({ ...c, id: "1" }))), { ...d, playbook });
    expect(llm).toBe(9);
    expect(run.stop).toBeUndefined();
    expect(d.monitor.counts.gemini).toBe(llm + other);
  });
  it("with the real pipeline the local-act calls are counted once too", async () => {
    let total = 0;
    const generate: GenerateFn = async (_m, body) => { total += 1; return isLlm(body) ? genText({ venues: ["V"], brands: [], local_acts: [] }) : genText({ items: [{ name: "Suggested Act" }] }); };
    const d = deps({ generate });
    await runGrounding(plan([city1]), d);
    expect(total).toBe(2);
    expect(d.monitor.counts.gemini).toBe(2);
  });
  it("a persistent 404 on the LLM call is 3 attempts per model, with 2 backoff sleeps per model, then the run halts", async () => {
    const attempts: string[] = [];
    const sleeps: number[] = [];
    const generate: GenerateFn = async (m, body) => { if (isLlm(body)) { attempts.push(m); throw new Error("Vertex 404"); } return genText({ items: [] }); };
    const d = deps({ generate, models: ["a", "b"], sleep: async (ms) => { sleeps.push(ms); } });
    const run = await runGrounding(plan([city1]), d);
    expect(attempts).toEqual(["a", "a", "a", "b", "b", "b"]);
    expect(sleeps).toEqual([2000, 6000, 2000, 6000]);
    expect(run.stop).toMatch(/all Gemini models failed/);
  });
});

describe("other run guards", () => {
  it("stops when the Qloo call ceiling is reached", async () => {
    const d = deps({ qlooCeiling: 3 });
    const run = await runGrounding(plan([city1]), d);
    expect(run.stop).toMatch(/ceiling of 3/);
    expect(d.sent.length).toBeLessThanOrEqual(3 + 6); // calls already in flight may finish
    expect(run.items).toEqual([]);
  });
  it("a total failure of the local-act suggestions halts the run as an infrastructure failure", async () => {
    const generate: GenerateFn = async (_m, body) => { if (JSON.stringify(body).includes('"venues"')) return genText({ venues: [], brands: [], local_acts: [] }); throw new Error("Vertex 400"); };
    const run = await runGrounding(plan([city1]), deps({ generate }));
    expect(run.stop).toMatch(/local act/);
    expect(run.notRun.map((c) => c.cityId)).toEqual(["1"]);
  });
  it("excluded cities carry an error code", async () => {
    const run = await runGrounding(plan([city1]), deps({ callTool: async (tool) => ({ operation: tool, status: "empty", results: [] }) }));
    expect(run.excluded[0]!.code).toBe("LOCATION_UNRESOLVED");
  });
  it("de-duplication folds & into and, for the sheet only", () => {
    const base = { cityId: "5", city: "T", country: "MX", category: "venue" as const, rank: 1 };
    expect(buildRows([{ ...base, arm: "qloo", name: "Bar & Grill" }, { ...base, arm: "llm", name: "Bar and Grill" }])).toHaveLength(1);
  });
});

describe("Test C CLI runs", () => {
  const cityRow = scored("3530597", "Mexico City", "MX", 90, 40);
  const file = () => { const dir = mkdtempSync(join(tmpdir(), "ground-")); const f = join(dir, "showcase.json"); writeFileSync(f, JSON.stringify(showcase([cityRow]))); return { dir, f }; };
  const genFn: GenerateFn = async (_m, body) => (JSON.stringify(body).includes('"venues"') ? genText({ venues: ["LV1"], brands: ["Brand 1"], local_acts: ["LT1"] }) : genText({ items: [{ name: "Suggested Act" }] }));
  const makeIo = (callTool: (t: string, a: Record<string, unknown>) => QlooEnvelope): CliIo & { lines: string[] } => {
    const lines: string[] = [];
    return { lines, log: (l) => lines.push(l), env: {}, now: () => new Date("2026-10-24T12:00:00Z"), makeClients: () => ({ callTool: async (t, a) => callTool(t, a), generate: genFn, models: ["m1"] }) };
  };
  it("a full run writes items, key, sheet and CSV that share one run id", async () => {
    const { dir, f } = file();
    const code = await cli.mainWith({ showcase: f, outDir: join(dir, "out"), dryRun: false }, makeIo(happy));
    expect(code).toBe(0);
    const p = cli.outputPathsUnchecked(join(dir, "out"));
    for (const x of [p.items, p.key, p.sheet, p.csv]) expect(existsSync(x)).toBe(true);
    const items = JSON.parse(readFileSync(p.items, "utf8"));
    const key = JSON.parse(readFileSync(p.key, "utf8"));
    expect(items.runId).toMatch(/^[0-9a-f]{16}$/);
    expect(key.runId).toBe(items.runId);
    expect(items.stop.status).toBe("complete");
    expect(readFileSync(p.sheet, "utf8")).toContain("<!doctype html>");
  });
  it("a stopped run writes no sheet, and a re-run keeps the stopped items file as *.stopped-1.json", async () => {
    const { dir, f } = file();
    const rate = (t: string, a: Record<string, unknown>): QlooEnvelope => (t === "qloo_recommend" ? ({ operation: t, status: "error", summary: "rate limited", error: { code: "RATE" }, results: null } as unknown as QlooEnvelope) : happy(t, a));
    const out = join(dir, "out");
    expect(await cli.mainWith({ showcase: f, outDir: out, dryRun: false }, makeIo(rate))).toBe(1);
    const p = cli.outputPathsUnchecked(out);
    expect(existsSync(p.sheet)).toBe(false);
    expect(existsSync(p.key)).toBe(false);
    expect(JSON.parse(readFileSync(p.items, "utf8")).stop.status).toBe("stopped");
    expect(await cli.mainWith({ showcase: f, outDir: out, dryRun: false }, makeIo(happy))).toBe(0);
    const kept = p.items.replace(/\.json$/, ".stopped-1.json");
    expect(JSON.parse(readFileSync(kept, "utf8")).stop.status).toBe("stopped");
    expect(JSON.parse(readFileSync(p.items, "utf8")).stop.status).toBe("complete");
  });
  it("Test C outputs are refused anywhere but private-data/backtest, including outside the repo", () => {
    expect(() => cli.parseArgs(["--out-dir", join(tmpdir(), "x")])).toThrow(/private-data\/backtest/);
    expect(() => cli.parseArgs(["--out-dir", resolve(REPO_ROOT, "private-data/other")])).toThrow(/private-data\/backtest/);
    expect(() => cli.parseArgs(["--out-dir", resolve(REPO_ROOT, "private-data/backtest/sub")])).not.toThrow();
  });
});
