import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import { MemoryCache } from "../src/cache.js";
import type { GenerateFn } from "../src/narrative/gemini.js";
import { MemoryUsageStore } from "../src/web/usage.js";
import { QUERY_VERSION, advance, aggregateWeather, filterHolidays, resolveCountry, verifyAdvance, windowInYear, type AdvanceDeps } from "../src/web/advance.js";

const results = [
  { id: "w1", url: "https://a.example/visa", title: "Mexico work visa for musicians", content: "Foreign performers need a permit. Processing takes 30 days." },
  { id: "w2", url: "https://b.example/ata", title: "ATA Carnet Mexico", content: "An ATA Carnet covers instruments for up to 12 months." },
];
const reply = (o: unknown): GenerateFn => async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
const gen: GenerateFn = async (_m, body) => {
  const prompt = JSON.stringify(body);
  return reply(prompt.includes("customs rules")
    ? { summary: "An ATA Carnet helps.", items: [{ text: "A carnet covers instruments for up to 12 months", sourceUrl: "https://b.example/ata" }] }
    : { summary: "A permit is needed.", leadTime: "30 days", items: [{ text: "Foreign performers need a permit", sourceUrl: "https://a.example/visa" }] })(_m, body);
};
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const daily = (n: number) => ({ daily: { temperature_2m_max: Array.from({ length: n }, (_, i) => 20 + i), temperature_2m_min: Array.from({ length: n }, () => 10), precipitation_sum: Array.from({ length: n }, (_, i) => (i % 2 ? 2 : 0)) } });
const holidaysJson = [{ date: "2027-03-21", name: "Benito Juarez", localName: "Natalicio" }, { date: "2027-05-01", name: "Labour Day", localName: "Dia del Trabajo" }];
const fakeFetch = () => vi.fn(async (url: string | URL | Request) => {
  const u = String(url);
  if (u.includes("geocoding-api")) return json({ results: [{ latitude: 20.67, longitude: -103.35 }] });
  if (u.includes("archive-api")) return json(daily(4));
  if (u.includes("date.nager.at")) return json(holidaysJson);
  throw new Error(`unexpected ${u}`);
});
const input = { city: "Guadalajara", country: "MX", start: "2027-03-19", end: "2027-03-22", sessionId: "s" };
const NOW = Date.UTC(2026, 9, 30);
const deps = (over: Partial<AdvanceDeps> = {}): AdvanceDeps => ({
  search: vi.fn(async () => results), usage: new MemoryUsageStore(), cache: new MemoryCache(), generate: gen, fetchImpl: fakeFetch() as unknown as typeof fetch,
  models: ["m"], ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }), now: () => NOW, log: () => {}, warn: () => {}, ...over,
});

describe("weather maths", () => {
  it("aggregates mean/min/max, mean of mins and the rain share", () => {
    const w = aggregateWeather([2025, 2024], [{ max: 20, min: 10, precip: 0 }, { max: 30, min: 14, precip: 1 }, { max: 25, min: 12, precip: 5 }, { max: null, min: null, precip: null }]);
    expect(w).toMatchObject({ days: 3, years: [2024, 2025], tempMaxC: { mean: 25, min: 20, max: 30 }, tempMinC: { mean: 12 }, rainDaysShare: 0.67 });
    expect(w?.note).toBe("Typical weather, same dates in 2024–2025 (Open-Meteo history). Not a forecast.");
    expect(aggregateWeather([2025], [])).toBeNull();
  });
  it("maps the window to the same dates in another year, clamping Feb 29 and crossing year end", () => {
    expect(windowInYear("2027-03-19", 4, 2025)).toEqual({ start: "2025-03-19", end: "2025-03-22" });
    expect(windowInYear("2028-02-29", 2, 2025)).toEqual({ start: "2025-02-28", end: "2025-03-01" });
    expect(windowInYear("2026-12-30", 5, 2024)).toEqual({ start: "2024-12-30", end: "2025-01-03" });
  });
  it("geocodes, fetches 3 complete years (window capped at 14 days) and skips geocoding when lat/lon are given", async () => {
    const d = deps();
    const r = await advance({ ...input, end: "2027-05-30" }, d);
    const calls = (d.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes("geocoding-api"))).toHaveLength(1);
    expect(calls.find((u) => u.includes("geocoding-api"))).toContain("countryCode=MX");
    const archive = calls.filter((u) => u.includes("archive-api"));
    expect(archive).toHaveLength(3);
    expect(archive[0]).toContain("start_date=2025-03-19");
    expect(archive[0]).toContain("end_date=2025-04-01");
    expect(r.weather).toMatchObject({ status: "ok", years: [2023, 2024, 2025], days: 12 });
    const d2 = deps();
    await advance({ ...input, lat: 20.67, lon: -103.35 }, d2);
    expect((d2.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes("geocoding"))).toBe(false);
  });
});

describe("holidays", () => {
  it("keeps holidays inside the window and within 2 days, marking the latter near", () => {
    const all = [{ date: "2027-03-16", name: "z" }, { date: "2027-03-17", name: "a" }, { date: "2027-03-18", name: "b", localName: "bb" }, { date: "2027-03-20", name: "c" }, { date: "2027-03-24", name: "d" }, { date: "2027-03-25", name: "e" }];
    expect(filterHolidays(all, "2027-03-19", "2027-03-22")).toEqual([
      { date: "2027-03-17", name: "a", localName: "a", near: true }, { date: "2027-03-18", name: "b", localName: "bb", near: true }, { date: "2027-03-20", name: "c", localName: "c", near: false }, { date: "2027-03-24", name: "d", localName: "d", near: true }]);
  });
  it("is unavailable when Nager does not cover the country (204) or the country is unknown", async () => {
    const f = vi.fn(async (u: string | URL | Request) => String(u).includes("nager") ? new Response(null, { status: 204 }) : json(daily(4)));
    expect((await advance(input, deps({ fetchImpl: f as unknown as typeof fetch }))).holidays.status).toBe("unavailable");
    expect((await advance({ ...input, country: "Atlantis" }, deps())).holidays.status).toBe("unavailable");
  });
  it("returns the in-window holiday", async () => {
    const r = await advance(input, deps());
    expect(r.holidays).toMatchObject({ status: "ok", items: [{ date: "2027-03-21", name: "Benito Juarez", near: false }] });
  });
});

describe("advance", () => {
  it("resolves countries from codes and names", () => {
    expect(resolveCountry("mx")).toEqual({ code: "MX", name: "Mexico" });
    expect(resolveCountry("Brazil")).toEqual({ code: "BR", name: "Brazil" });
    expect(resolveCountry("Nowhere").code).toBeUndefined();
  });
  it("one failing section never fails the others", async () => {
    const f = vi.fn(async (u: string | URL | Request) => { if (String(u).includes("archive-api")) throw new Error("boom"); return fakeFetch()(u); });
    const search = vi.fn(async () => { throw new Error("tavily down"); });
    const r = await advance(input, deps({ fetchImpl: f as unknown as typeof fetch, search }));
    expect(r.weather.status).toBe("unavailable");
    expect(r.visa.status).toBe("unavailable");
    expect(r.equipment.status).toBe("unavailable");
    expect(r.holidays.status).toBe("ok");
  });
  it("a section that throws outright is isolated", async () => {
    const cache = new MemoryCache();
    const spy = vi.spyOn(cache, "get").mockImplementation(async () => { throw new Error("cache down"); });
    const r = await advance(input, deps({ cache }));
    spy.mockRestore();
    expect(r.visa.status).toBe("ok");
    expect(r.holidays.status).toBe("ok");
  });
  it("summarises visa (with lead time) and equipment, with sources", async () => {
    const r = await advance(input, deps());
    expect(r.visa).toMatchObject({ status: "ok", leadTime: "30 days", items: [{ sourceUrl: "https://a.example/visa" }], sources: [{ url: "https://a.example/visa" }, { url: "https://b.example/ata" }] });
    expect(r.visa.status === "ok" && r.visa.artistCountry).toBeFalsy();
    expect(r.equipment).toMatchObject({ status: "ok", items: [{ sourceUrl: "https://b.example/ata" }] });
  });
  it("serves repeat requests from cache with no external calls", async () => {
    const d = deps();
    await advance(input, d);
    const fetchCalls = (d.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const again = await advance({ ...input, city: "Zapopan" , lat: 1, lon: 2 }, d);
    expect(d.search).toHaveBeenCalledTimes(2); // visa + equipment, once each per country
    expect(again.visa.status === "ok" && again.visa.cached).toBe(true);
    expect(again.holidays.status).toBe("ok");
    expect((d.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls + 3); // weather for the new place only; holidays cached
    const third = await advance(input, d);
    expect(third.weather.status).toBe("ok");
    expect((d.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls + 3);
  });
  it("keys visa by the artist's country", async () => {
    const d = deps();
    await advance({ ...input, artistCountry: "GB" }, d);
    await advance({ ...input, artistCountry: "AR" }, d);
    expect(d.search).toHaveBeenCalledTimes(3); // visa GB, equipment, visa AR
    const q = (d.search as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(q[0]).toContain("United Kingdom");
    expect(q[1]).toContain("ATA Carnet");
  });
  it("reports capped for the web sections only, and weather/holidays still work", async () => {
    const usage = { tryIncrement: async () => ({ ok: false as const, scope: "day" as const }) };
    const search = vi.fn(async () => results);
    const r = await advance(input, deps({ usage, search }));
    expect(r.visa).toMatchObject({ status: "capped", message: "Web lookups are paused for today." });
    expect(r.equipment.status).toBe("capped");
    expect(search).not.toHaveBeenCalled();
    expect(r.weather.status).toBe("ok");
    expect(r.holidays.status).toBe("ok");
  });
  it("is unavailable without a search key or Gemini, listing sources when it has them", async () => {
    const r = await advance(input, deps({ search: undefined }));
    expect(r.visa.status).toBe("unavailable");
    const noGen = await advance(input, deps({ generate: undefined }));
    expect(noGen.visa).toMatchObject({ status: "unavailable", sources: [{ url: "https://a.example/visa" }, { url: "https://b.example/ata" }] });
  });
  it("counts a Gemini call against the daily ceiling", async () => {
    const dailyUsage = new MemoryUsageStore({ perDay: 1, perMonth: 10 });
    const r = await advance(input, deps({ dailyUsage }));
    const statuses = [r.visa.status, r.equipment.status].sort();
    expect(statuses).toEqual(["ok", "unavailable"]);
  });
});

describe("verifyAdvance", () => {
  it("drops items whose source url was not returned or whose numbers are not in that source", () => {
    const v = verifyAdvance({ summary: "Permit in 99 days", leadTime: "30 days", items: [
      { text: "Permit takes 30 days", sourceUrl: "https://a.example/visa" },
      { text: "Permit takes 45 days", sourceUrl: "https://a.example/visa" },
      { text: "Needs a permit", sourceUrl: "https://evil.example/x" },
      { text: "Carnet up to 12 months", sourceUrl: "https://b.example/ata" },
    ] }, results);
    expect(v.items.map((i) => i.text)).toEqual(["Permit takes 30 days", "Carnet up to 12 months"]);
    expect(v.removed.map((r) => r.reason)).toEqual(["number not in source", "source not in results"]);
    expect(v.summary).toBe("");
    expect(v.leadTime).toBe("30 days");
    expect(verifyAdvance({ leadTime: "6 weeks", items: [] }, results).leadTime).toBeUndefined();
  });
});

describe("destination-country filtering", () => {
  const us = { city: "Los Angeles", country: "US", start: "2027-03-19", end: "2027-03-22", sessionId: "s" };
  const mixed = [
    { id: "w1", url: "https://uscis.gov/o1", title: "O-1 and P-1 visas for foreign performers - USCIS", content: "Foreign musicians performing in the United States need a P-1 or O-1 petition." },
    { id: "w2", url: "https://example.ca/p2", title: "P2 Work Permits for Musicians - Legal Requirements - Canada", content: "The P2 Reciprocal Exchange fee is $510." },
    { id: "w3", url: "https://immifrance.fr/touring", title: "Touring France - ImmiFrance", content: "Artists touring France need a declaration." },
    { id: "w4", url: "https://alifvisa.example/x", title: "Alif Visa", content: "Apply for a visa online in 5 days." },
  ];
  it("queries with the full country name and keeps only destination-country sources in the prompt", async () => {
    const search = vi.fn(async () => mixed);
    const generate = vi.fn(reply({ summary: "x", items: [] }));
    await advance(us, deps({ search, generate: generate as unknown as GenerateFn }));
    expect(search.mock.calls.map((c) => String((c as unknown[])[0]))[0]).toContain("United States");
    const prompts = generate.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(prompts).toContain("uscis.gov/o1");
    expect(prompts).not.toContain("example.ca");
    expect(prompts).not.toContain("immifrance");
    expect(prompts).not.toContain("alifvisa");
    expect(prompts).toContain("IN United States");
  });
  it("never lists wrong-country sources or their items, for visa or equipment", async () => {
    const generate: GenerateFn = reply({ summary: "s", items: [
      { text: "P-1 petition needed", sourceUrl: "https://uscis.gov/o1" },
      { text: "The P2 fee is $510", sourceUrl: "https://example.ca/p2" },
    ] });
    const r = await advance(us, deps({ search: vi.fn(async () => mixed), generate }));
    for (const s of [r.visa, r.equipment]) {
      if (s.status !== "ok") throw new Error("expected ok");
      expect(s.items.map((i) => i.text)).toEqual(["P-1 petition needed"]);
      expect(s.sources.map((x) => x.url)).toEqual(["https://uscis.gov/o1"]);
    }
  });
  it("verifyAdvance drops items cited to a source for another country", () => {
    const v = verifyAdvance({ items: [{ text: "P-1 petition needed", sourceUrl: "https://uscis.gov/o1" }, { text: "Fee is $510", sourceUrl: "https://example.ca/p2" }] }, mixed, "US");
    expect(v.items.map((i) => i.text)).toEqual(["P-1 petition needed"]);
    expect(v.removed[0]?.reason).toBe("source not in results");
  });
  it("uses aliases (MX: INM/México) and bumps the cache version", async () => {
    const mx = [{ id: "a", url: "https://inm.gob.mx/x", title: "Permisos INM para artistas", content: "Artistas extranjeros." }, { id: "b", url: "https://x.example/b", title: "Brasil visto artista", content: "Brazil visa" }];
    const generate = vi.fn(reply({ summary: "x", items: [] }));
    await advance(input, deps({ search: vi.fn(async () => mx), generate: generate as unknown as GenerateFn }));
    const p = generate.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(p).toContain("inm.gob.mx");
    expect(p).not.toContain("x.example/b");
    expect(QUERY_VERSION).toBe("advance-v2");
  });
});

describe("holiday de-duplication", () => {
  it("collapses per-subdivision duplicates by date and name, preferring the nationwide entry", () => {
    const all = [
      { date: "2027-03-26", name: "Good Friday", localName: "Good Friday", global: false, counties: ["US-CA"] },
      { date: "2027-03-26", name: "Good Friday", localName: "Good Friday", global: true, counties: null },
      { date: "2027-03-26", name: "Good Friday", localName: "Good Friday", global: false, counties: ["US-NY"] },
      { date: "2027-03-26", name: "Other", localName: "Other" },
    ];
    const out = filterHolidays(all, "2027-03-25", "2027-03-27");
    expect(out.map((h) => h.name)).toEqual(["Good Friday", "Other"]);
  });
  it("keeps one entry when only subdivision entries exist", () => {
    const all = [{ date: "2027-03-26", name: "Good Friday", global: false, counties: ["US-CA"] }, { date: "2027-03-26", name: "Good Friday", global: false, counties: ["US-NY"] }];
    expect(filterHolidays(all, "2027-03-25", "2027-03-27")).toHaveLength(1);
  });
});
