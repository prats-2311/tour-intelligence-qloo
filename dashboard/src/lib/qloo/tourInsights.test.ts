import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY } from "./labels";
import {
  applyTourFilters, buildQuadrant, cityScoreRows, countByCountry, defaultTourFilters, hasActiveFilters, parseTourFilters,
  sponsorLiftRows, statusCounts, topCityId, verdictCounts, verdictLines, writeTourFilters, zoneShareRows, openThreadsByCity, SPONSOR_LIFT_CAPTION, ZONE_SHARE_LABEL,
} from "./tourInsights";
import type { CityStatus } from "@/lib/collab/types";
import type { PlaybookCard, ScoredCity } from "./types";

const none = () => null;
const names = (cs: ScoredCity[]) => cs.map((c) => c.name);

describe("parseTourFilters / writeTourFilters (URL sync)", () => {
  it("parses nothing into the defaults", () => {
    expect(parseTourFilters(new URLSearchParams(""))).toEqual(defaultTourFilters());
    expect(defaultTourFilters()).toEqual({ countries: [], verdicts: [], statuses: [], minWinnability: 0, sort: "winnability" });
  });
  it("round-trips every filter through the query", () => {
    const f = { countries: ["MX", "BR"], verdicts: ["play", "hidden_goldmine"] as const, statuses: ["confirmed"] as CityStatus[], minWinnability: 60, sort: "fanHeat" as const };
    const q = writeTourFilters(new URLSearchParams(), { ...f, verdicts: [...f.verdicts] });
    expect(q.get("country")).toBe("MX,BR");
    expect(q.get("verdict")).toBe("play,hidden_goldmine");
    expect(q.get("team")).toBe("confirmed");
    expect(q.get("minWin")).toBe("60");
    expect(q.get("sort")).toBe("fanHeat");
    expect(parseTourFilters(q)).toEqual({ ...f, verdicts: [...f.verdicts] });
  });
  it("omits defaults and keeps unrelated params (showcase, ws, city)", () => {
    const q = writeTourFilters(new URLSearchParams("showcase=1&ws=abc&country=MX&minWin=40"), defaultTourFilters());
    expect(q.toString()).toBe("showcase=1&ws=abc");
    const kept = writeTourFilters(new URLSearchParams("showcase=1&ws=abc"), { ...defaultTourFilters(), countries: ["US"] });
    expect(kept.get("showcase")).toBe("1");
    expect(kept.get("ws")).toBe("abc");
    expect(kept.get("country")).toBe("US");
  });
  it("drops unknown verdicts, statuses and sorts and clamps the slider", () => {
    const f = parseTourFilters(new URLSearchParams("verdict=play,bogus&team=confirmed,nope&sort=zzz&minWin=900&country=mx,,BR"));
    expect(f.verdicts).toEqual(["play"]);
    expect(f.statuses).toEqual(["confirmed"]);
    expect(f.sort).toBe("winnability");
    expect(f.minWinnability).toBe(100);
    expect(f.countries).toEqual(["MX", "BR"]);
    expect(parseTourFilters(new URLSearchParams("minWin=abc")).minWinnability).toBe(0);
    expect(parseTourFilters(new URLSearchParams("minWin=-5")).minWinnability).toBe(0);
  });
  it("hasActiveFilters ignores sort", () => {
    expect(hasActiveFilters(defaultTourFilters())).toBe(false);
    expect(hasActiveFilters({ ...defaultTourFilters(), sort: "name" })).toBe(false);
    expect(hasActiveFilters({ ...defaultTourFilters(), minWinnability: 1 })).toBe(true);
  });
});

describe("applyTourFilters", () => {
  const f = defaultTourFilters();
  it("country is an inclusive multi-select (empty means all)", () => {
    expect(new Set(applyTourFilters(SAMPLE_CITIES, { ...f, countries: ["MX"] }, none).map((c) => c.country))).toEqual(new Set(["MX"]));
    expect(applyTourFilters(SAMPLE_CITIES, { ...f, countries: ["MX", "BR"] }, none).every((c) => ["MX", "BR"].includes(c.country))).toBe(true);
    expect(applyTourFilters(SAMPLE_CITIES, f, none)).toHaveLength(SAMPLE_CITIES.length);
  });
  it("verdict filter keeps only the chosen verdicts", () => {
    const out = applyTourFilters(SAMPLE_CITIES, { ...f, verdicts: ["play", "de_risk"] }, none);
    expect(names(out).sort()).toEqual(["Los Angeles", "Mexico City", "São Paulo"]);
  });
  it("min winnability keeps cities at or above it; a null winnability never passes a positive minimum", () => {
    const withNull: ScoredCity = { ...SAMPLE_CITIES[0]!, id: "n", name: "Nullville", winnability: { value: null, refs: [] } };
    const out = applyTourFilters([...SAMPLE_CITIES, withNull], { ...f, minWinnability: 72 }, none);
    expect(names(out)).toEqual(["Mexico City", "São Paulo", "Guadalajara"]);
    expect(applyTourFilters([withNull], f, none)).toHaveLength(1);
  });
  it("team status filter uses the workspace status; a city with none counts as Considering", () => {
    const st = (id: string): CityStatus | null => (id === "3530597" ? "confirmed" : id === "3448439" ? "on_hold" : null);
    expect(names(applyTourFilters(SAMPLE_CITIES, { ...f, statuses: ["confirmed"] }, st))).toEqual(["Mexico City"]);
    expect(names(applyTourFilters(SAMPLE_CITIES, { ...f, statuses: ["on_hold"] }, st))).toEqual(["São Paulo"]);
    expect(applyTourFilters(SAMPLE_CITIES, { ...f, statuses: ["considering"] }, st)).toHaveLength(SAMPLE_CITIES.length - 2);
  });
  it("filters combine (AND)", () => {
    const out = applyTourFilters(SAMPLE_CITIES, { ...f, countries: ["BR"], verdicts: ["consider"] }, none);
    expect(names(out)).toEqual(["Rio de Janeiro"]);
  });
  it("sorts by winnability, fan heat, activation (high to low, null last) and by name", () => {
    expect(names(applyTourFilters(SAMPLE_CITIES, f, none))[0]).toBe("Mexico City");
    expect(names(applyTourFilters(SAMPLE_CITIES, { ...f, sort: "fanHeat" }, none)).slice(0, 2)).toEqual(["Mexico City", "Los Angeles"]);
    expect(names(applyTourFilters(SAMPLE_CITIES, { ...f, sort: "activation" }, none)).slice(0, 2)).toEqual(["Guadalajara", "Curitiba"]);
    const byName = names(applyTourFilters(SAMPLE_CITIES, { ...f, sort: "name" }, none));
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    const nullAct: ScoredCity = { ...SAMPLE_CITIES[0]!, id: "n", name: "Nullville", activation: { value: null, refs: [] } };
    expect(names(applyTourFilters([nullAct, SAMPLE_CITIES[1]!], { ...f, sort: "activation" }, none))).toEqual(["São Paulo", "Nullville"]);
  });
  it("does not mutate its input", () => {
    const copy = [...SAMPLE_CITIES];
    applyTourFilters(SAMPLE_CITIES, { ...f, sort: "name" }, none);
    expect(SAMPLE_CITIES).toEqual(copy);
  });
  it("topCityId is the most winnable filtered city", () => {
    expect(topCityId(SAMPLE_CITIES)).toBe("3530597");
    expect(topCityId([])).toBeNull();
  });
});

describe("chart data from the board", () => {
  it("cityScoreRows: one row per city, three metrics, verdict kept, null scores stay null", () => {
    const rows = cityScoreRows(SAMPLE_CITIES.slice(0, 2));
    expect(rows[0]).toMatchObject({ id: "3530597", name: "Mexico City", verdict: "play", fanHeat: 91, activation: 77, winnability: 84 });
    const n = cityScoreRows([{ ...SAMPLE_CITIES[0]!, fanHeat: { value: null, refs: [] } }]);
    expect(n[0]!.fanHeat).toBeNull();
  });
  it("buildQuadrant: only cities with both scores become points; guides come from the thresholds", () => {
    const t = DEFAULT_SCORING_DISPLAY.thresholds;
    const noAct: ScoredCity = { ...SAMPLE_CITIES[0]!, id: "n", name: "N", activation: { value: null, refs: [] } };
    const q = buildQuadrant([...SAMPLE_CITIES, noAct], t);
    expect(q.points).toHaveLength(SAMPLE_CITIES.filter((c) => c.activation.value !== null && c.fanHeat.value !== null).length);
    expect(q.points.find((p) => p.id === "3530597")).toMatchObject({ x: 91, y: 77, verdict: "play" });
    expect(q.skipped).toBe(SAMPLE_CITIES.length + 1 - q.points.length);
    expect(q.skipped).toBeGreaterThanOrEqual(1);
  });
  it("verdictLines come from the thresholds object and are not invented", () => {
    const t = { playFan: 71, playAct: 61, goldmineFanMin: 46, goldmineFanMax: 71, goldmineAct: 76, deRiskFan: 71, deRiskAct: 44, considerWin: 55 };
    const l = verdictLines(t);
    expect(l.vertical.map((x) => x.at).sort()).toEqual([46, 71]);
    expect(l.horizontal.map((x) => x.at).sort()).toEqual([44, 61, 76]);
    expect(verdictLines(DEFAULT_SCORING_DISPLAY.thresholds).vertical.map((x) => x.at).sort()).toEqual([45, 70]);
  });
  it("verdictCounts and countByCountry count the filtered cities", () => {
    const v = verdictCounts(SAMPLE_CITIES);
    expect(v.play).toBe(2);
    expect(v.hidden_goldmine).toBe(2);
    expect(Object.values(v).reduce((a, b) => a + b, 0)).toBe(SAMPLE_CITIES.length);
    const c = countByCountry(SAMPLE_CITIES.slice(0, 5));
    expect(c.find((x) => x.country === "MX")!.verdicts.play).toBe(1);
    expect(c.find((x) => x.country === "MX")!.verdicts.hidden_goldmine).toBe(1);
    expect(c.reduce((a, x) => a + x.total, 0)).toBe(5);
  });
});

const card = (items: Array<Record<string, unknown>>, kind: PlaybookCard["kind"] = "sponsors"): PlaybookCard => ({ kind, status: "ok", items, refs: [], warnings: [] });

describe("sponsorLiftRows", () => {
  const items = [
    { name: "Gamma", artistRank: 3, cityRank: 12 },
    { name: "Alpha", artistRank: 1, cityRank: null },
    { name: "Planned Parenthood", artistRank: 2, cityRank: null },
    { name: "Ariel Pink", artistRank: 4, cityRank: null },
    { name: "NoRank", affinity: 0.9 },
    ...Array.from({ length: 12 }, (_, i) => ({ name: `B${i}`, artistRank: 5 + i, cityRank: 5 + i })),
  ];
  it("takes the top 10 by fan rank, with city rank or 'not in the city's top 20'", () => {
    const rows = sponsorLiftRows(card(items));
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ name: "Alpha", fanRank: 1, cityRank: null, cityText: "Not in the city's top 20" });
    expect(rows[1]).toMatchObject({ name: "Gamma", fanRank: 3, cityRank: 12, cityText: "City #12" });
  });
  it("applies the display filters: non-sponsor organisations and the do-not-book act never appear", () => {
    const rows = sponsorLiftRows(card(items));
    expect(rows.map((r) => r.name)).not.toContain("Planned Parenthood");
    expect(rows.map((r) => r.name)).not.toContain("Ariel Pink");
    expect(rows.map((r) => r.name)).not.toContain("NoRank");
  });
  it("is empty for a missing or empty card", () => {
    expect(sponsorLiftRows(undefined)).toEqual([]);
    expect(sponsorLiftRows(card([]))).toEqual([]);
  });
  it("caption explains rank-based lift without percentages", () => {
    expect(SPONSOR_LIFT_CAPTION).toMatch(/rank/i);
    expect(SPONSOR_LIFT_CAPTION).not.toMatch(/%/);
  });
});

describe("zoneShareRows", () => {
  it("merges zones by name, strongest first, share 0-1", () => {
    const c = SAMPLE_CITIES[0]!;
    const rows = zoneShareRows(c);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ label: "Mexico City centre", share: 0.38 });
    expect(ZONE_SHARE_LABEL).toBe("share of in-city fan heat");
  });
  it("drops non-finite shares and handles no zones", () => {
    const c: ScoredCity = { ...SAMPLE_CITIES[0]!, zones: [{ label: "A", lat: 0, lon: 0, affinity: 1, index: 0, share: Number.NaN }] };
    expect(zoneShareRows(c)).toEqual([]);
    expect(zoneShareRows({ ...c, zones: [] })).toEqual([]);
  });
});

describe("team status overview", () => {
  const snap = {
    statuses: { "3530597": { status: "confirmed" }, "3448439": { status: "on_hold" } },
    threads: {
      "city:3530597": { resolved: false, messages: [{ id: "1", text: "x", name: "A", role: "Manager", at: 1 }, { id: "2", text: "y", name: "B", role: "Manager", at: 2 }] },
      "card:3530597:sponsors": { resolved: false, messages: [{ id: "3", text: "z", name: "A", role: "Manager", at: 3 }] },
      "city:3448439": { resolved: true, messages: [{ id: "4", text: "done", name: "A", role: "Manager", at: 4 }] },
      "city:unknown": { resolved: false, messages: [{ id: "5", text: "q", name: "A", role: "Manager", at: 5 }] },
      "city:3464975": { resolved: false, messages: [] },
    },
  } as never;
  it("counts cities by status, unset as Considering", () => {
    const c = statusCounts(SAMPLE_CITIES, snap);
    expect(c.confirmed).toBe(1);
    expect(c.on_hold).toBe(1);
    expect(c.dropped).toBe(0);
    expect(c.considering).toBe(SAMPLE_CITIES.length - 2);
  });
  it("lists open threads per shown city, ignoring resolved, empty and unknown ones", () => {
    const t = openThreadsByCity(SAMPLE_CITIES, snap);
    expect(t).toEqual([{ cityId: "3530597", name: "Mexico City", threads: 2, messages: 3 }]);
  });
});
