import { afterEach, describe, expect, it, vi } from "vitest";
import type { City } from "../src/geo/cities.js";
import { cityPopularityArgs, localActRankArgs } from "../src/pipeline/recArgs.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { readFileSync } from "node:fs";
import { cityHeat, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 }];
const liveEnv = (name: string): QlooEnvelope => ({ operation: name, ...JSON.parse(readFileSync(new URL(`./fixtures/live/${name}.json`, import.meta.url), "utf8")) }) as QlooEnvelope;
const tag = (name: string, score: number) => ({ tag_id: `urn:tag:genre:music:${name}`, name, type: "urn:tag", query: { score } });
const compareOf = (...tags: Array<[string, number]>): QlooEnvelope => ({ operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags: tags.map(([n, sc]) => tag(n, sc)) } });
// mean of the top-5 scores is 0.5
const compare = compareOf(["Funk", 0.9], ["Soul", 0.7], ["Pop", 0.5], ["Rock", 0.3], ["Jazz", 0.1], ["Folk", 0.05]);

function qloo(route: (t: string, a: Record<string, unknown>) => QlooEnvelope): QlooCaller {
  let n = 0;
  return { async call(tool, args) { n += 1; return { envelope: route(tool, args), cacheKey: `k${n}`, cached: false, stale: false }; } };
}
const proxies = (names: string[], affs: number[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results: names.map((name, i) => ({ entity_id: `P${i}`, name, affinity: affs[i] })) });
const happy = (t: string, a: Record<string, unknown>): QlooEnvelope => {
  if (t === "qloo_where_popular") return cityHeat;
  if (t === "qloo_entity_tags") return liveEnv("entity-tags");
  if (t === "qloo_recommend" && !a.signals) return proxies(["Proxy 1", "Proxy 2"], [0.7, 0.6]);
  if (t === "qloo_compare_audiences") return compare;
  if (t === "qloo_rank" && a.option_type === "artist") return proxies(["Proxy 2", "Proxy 1"], [0.95, 0.4]);
  if (t === "qloo_rank") return recs(["Venue A", "Venue B"], [0.8, 0.6]);
  if (t === "qloo_recommend" && a.target_type === "place") return recs(["Place 1", "Place 2", "Place 3", "Place 4"], [0.5, 0.9, 0.7, 0.8]);
  if (t === "qloo_recommend" && a.target_type === "artist") return recs(["Opener 1", "Opener 2", "Opener 3", "Opener 4"], [0.9, 0.8, 0.7, 0.6]);
  return recs(["X", "Y"], [0.7, 0.5]);
};
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s" };
type Cards = Array<{ kind: string; status: string; items: Array<Record<string, unknown>>; warnings: Array<{ kind: string }> }>;
const cardsOf = (events: GatewayEvent[]) => (events.find((e) => e.type === "playbook") as { playbook: { cards: Cards } }).playbook.cards;

afterEach(() => { vi.restoreAllMocks(); });

describe("runCityPlaybook", () => {
  it("produces all seven evidence cards in order", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES }));
    expect(cardsOf(events).map((c) => c.kind)).toEqual(["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing", "talent"]);
    expect(events.at(-1)?.type).toBe("done");
  });
  it("talent compares the artist with the city's mainstream proxy, not with its own recs", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_recommend" && !a.signals) seen.push(a); return happy(t, a); }), cities: CITIES }));
    expect(seen).toEqual([{ target_type: "artist", signal_location: "Mexico City, MX", limit: 10 }]);
    expect(seen).toEqual([cityPopularityArgs("artist", "Mexico City, MX", 10)]);
    const talent = cardsOf(events).find((c) => c.kind === "talent")! as unknown as { items: Array<{ name: string }>; summary: { sharedTaste: number | null; sharedTags: string[] } };
    expect(talent.items.map((i) => i.name)).toEqual(["Proxy 2", "Proxy 1"]);
    expect(talent.summary.sharedTaste).toBeCloseTo(0.5, 10);
    expect(talent.summary.sharedTags).toEqual(["Funk", "Soul", "Pop"]);
    expect(talent.summary).not.toHaveProperty("overlap");
  });
  it("talent items are the city's popular artists re-ranked by taste fit, with the rank affinity", async () => {
    const ranks: Array<Record<string, unknown>> = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_rank" && a.option_type === "artist") ranks.push(a); return happy(t, a); }), cities: CITIES }));
    expect(ranks).toEqual([localActRankArgs("A1", "Mexico City, MX", ["P0", "P1"])]);
    const talent = cardsOf(events).find((c) => c.kind === "talent")! as unknown as { items: Array<{ name: string; entityId: string; affinity: number }>; refs: Array<{ tool: string }>; warnings: Array<{ tool: string }> };
    expect(talent.items).toEqual([{ name: "Proxy 2", entityId: "P0", affinity: 0.95 }, { name: "Proxy 1", entityId: "P1", affinity: 0.4 }]);
    expect(talent.refs.map((r) => r.tool)).toEqual(["qloo_recommend", "qloo_rank", "qloo_compare_audiences"]);
    expect(talent.warnings.filter((w) => w.tool === "qloo_rank")).toEqual([]);
  });
  it("talent shows only the top 5 of the ranked list", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `R${i}`);
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => {
      if (t === "qloo_recommend" && !a.signals) return proxies(many(10), many(10).map(() => 0.5));
      if (t === "qloo_rank" && a.option_type === "artist") return proxies(many(10), many(10).map((_, i) => 0.9 - i * 0.05));
      return happy(t, a);
    }), cities: CITIES }));
    expect(cardsOf(events).find((c) => c.kind === "talent")!.items).toHaveLength(5);
  });
  it("talent falls back to city-popularity order with a warning when the taste rank fails", async () => {
    const empty = { operation: "rank", status: "empty", results: [] } as QlooEnvelope;
    const expected = { tool: "qloo_rank", kind: "partial", message: "taste ranking unavailable — showing the city's most popular artists" };
    for (const failing of [empty, { operation: "rank", status: "error", results: null } as unknown as QlooEnvelope]) {
      const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => (t === "qloo_rank" && a.option_type === "artist" ? failing : happy(t, a))), cities: CITIES }));
      const talent = cardsOf(events).find((c) => c.kind === "talent")!;
      expect(talent.items.map((i) => i.name)).toEqual(["Proxy 1", "Proxy 2"]);
      expect(talent.status).toBe("ok");
      expect(talent.warnings).toContainEqual(expected);
    }
  });
  it("talent shared taste still compares the first 5 candidates in city-popularity order, not the ranked order", async () => {
    const cmps: Array<Record<string, unknown>> = [];
    const many = (n: number) => Array.from({ length: n }, (_, i) => `R${i}`);
    await collect(runCityPlaybook(input, { qloo: qloo((t, a) => {
      if (t === "qloo_recommend" && !a.signals) return proxies(many(8), many(8).map(() => 0.5));
      if (t === "qloo_rank" && a.option_type === "artist") return proxies(many(8).reverse(), many(8).map((_, i) => 0.9 - i * 0.05));
      if (t === "qloo_compare_audiences" && (a.group_b as string[]).length > 1) cmps.push(a);
      return happy(t, a);
    }), cities: CITIES }));
    expect(cmps.map((a) => a.group_b)).toEqual([["P0", "P1", "P2", "P3", "P4"]]);
  });
  it("talent with no proxy artists is empty and makes no compare call", async () => {
    let compares = 0;
    let ranked = 0;
    const route = (t: string, a: Record<string, unknown>) => {
      if (t === "qloo_rank" && a.option_type === "artist") ranked += 1;
      if (t === "qloo_recommend" && !a.signals) return { operation: "recommend", status: "empty", results: [] } as QlooEnvelope;
      if (t === "qloo_compare_audiences" && (a.group_b as string[])[0]?.startsWith("P")) compares += 1;
      return happy(t, a);
    };
    const events = await collect(runCityPlaybook(input, { qloo: qloo(route), cities: CITIES }));
    expect(cardsOf(events).find((c) => c.kind === "talent")!.status).toBe("empty");
    expect(compares).toBe(0);
    expect(ranked).toBe(0);
  });
  it("merch carries the artist tags and cites both tags and brands", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES }));
    const merch = cardsOf(events).find((c) => c.kind === "merch")! as unknown as { items: Array<{ name: string }>; refs: Array<{ tool: string }> };
    expect(merch.items.length).toBeGreaterThan(0);
    expect(merch.items.every((i) => /^urn:tag:(genre:music|subgenre:|artist:qloo)/.test(String((i as unknown as { id: string }).id)))).toBe(true);
    expect(merch.items.map((i) => i.name)).not.toContain("Discover");
    expect(merch.items.every((i, n) => (i as unknown as { entityId: string; index: number }).entityId === (i as unknown as { id: string }).id && (i as unknown as { index: number }).index === n)).toBe(true);
    expect(merch.refs.map((r) => r.tool)).toEqual(["qloo_entity_tags", "qloo_recommend"]);
  });
  it("co-billing compares only the top 3 candidates and ranks by lift", async () => {
    const seen: string[] = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_compare_audiences") { const id = String((a.group_b as string[])[0]); if (id.startsWith("E")) seen.push(id); } return happy(t, a); }), cities: CITIES }));
    expect(seen).toEqual(["E0", "E1", "E2"]);
    const co = cardsOf(events).find((c) => c.kind === "co_billing")!;
    expect(co.items[0]!.lift as number).toBeGreaterThanOrEqual(co.items[1]!.lift as number);
    expect(co.items[0]).toMatchObject({ sharedTaste: 0.5, sharedTags: ["Funk", "Soul", "Pop"] });
    expect(co.items[0]).not.toHaveProperty("overlap");
    expect(co.items[0]!.lift as number).toBeCloseTo(0.5 * (co.items[0]!.localAffinity as number), 10);
  });
  it("marks cards empty instead of inventing items", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t) => ({ operation: t, status: "empty", results: [] })), cities: CITIES }));
    expect(cardsOf(events).every((c) => c.status === "empty" && c.items.length === 0)).toBe(true);
  });
  it("BUDGET during compare yields error BUDGET and no playbook/done", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_compare_audiences"
        ? ({ operation: t, status: "error", summary: "budget out", error: { code: "BUDGET", retryable: false } } as unknown as QlooEnvelope)
        : happy(t, a))),
      cities: CITIES,
    }));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "BUDGET" });
    expect(events.some((e) => e.type === "playbook" || e.type === "done")).toBe(false);
  });
  it("yields narrative after playbook and before done when a narrator is configured", async () => {
    const narrate = vi.fn(async () => ({ status: "unavailable" as const, reason: "disabled" as const, message: "m" }));
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES, narrate }));
    expect(events.slice(-3).map((e) => e.type)).toEqual(["playbook", "narrative", "done"]);
    expect(narrate.mock.calls[0]![0].cards).toHaveLength(7);
  });
  it("skips the narrative phase when narrative is false", async () => {
    const narrate = vi.fn();
    const events = await collect(runCityPlaybook({ ...input, narrative: false }, { qloo: qloo(happy), cities: CITIES, narrate }));
    expect(narrate).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "narrative")).toBe(false);
  });
  it("turns a throwing narrator into an unavailable narrative, still ending in done", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES, narrate: async () => { throw new Error("boom"); } }));
    expect(events.find((e) => e.type === "narrative")).toMatchObject({ narrative: { status: "unavailable", reason: "error" } });
    expect(warn).toHaveBeenCalledWith("[narrative] unavailable: boom");
    expect(events.at(-1)?.type).toBe("done");
  });
  it("BUDGET from entity tags ends the stream with error BUDGET and nothing after it", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_entity_tags"
        ? ({ operation: t, status: "error", summary: "budget out", error: { code: "BUDGET", retryable: false } } as unknown as QlooEnvelope)
        : happy(t, a))),
      cities: CITIES,
    }));
    const i = events.findIndex((e) => e.type === "error");
    expect(events[i]).toMatchObject({ code: "BUDGET" });
    expect(i).toBe(events.length - 1);
    expect(events.some((e) => e.type === "playbook" || e.type === "done")).toBe(false);
  });
  it("abort before start yields error ABORTED", async () => {
    const ac = new AbortController();
    ac.abort();
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES, signal: ac.signal }));
    expect(events).toEqual([{ type: "error", code: "ABORTED", message: "client disconnected" }]);
  });
  it("partial brand recommend puts a partial warning on the sponsors card", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_recommend" && a.target_type === "brand" ? { ...recs(["B1"], [0.5]), status: "partial", summary: "some missing" } : happy(t, a))),
      cities: CITIES,
    }));
    const sponsors = cardsOf(events).find((c) => c.kind === "sponsors")!;
    expect(sponsors.warnings).toContainEqual(expect.objectContaining({ kind: "partial" }));
  });
  it("a compare with no shared tags yields a partial warning per candidate and an empty co_billing card", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_compare_audiences" ? compareOf() : happy(t, a))),
      cities: CITIES,
    }));
    const co = cardsOf(events).find((c) => c.kind === "co_billing")!;
    expect(co.status).toBe("empty");
    const ws = (co.warnings as Array<{ kind: string; message?: string }>).filter((w) => w.kind === "partial");
    expect(ws.map((w) => w.message)).toEqual(["shared taste unavailable for Opener 1", "shared taste unavailable for Opener 2", "shared taste unavailable for Opener 3"]);
  });
  it("talent with a compare that has no tags keeps the proxies with a null shared taste and a warning", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_compare_audiences" ? compareOf() : happy(t, a))),
      cities: CITIES,
    }));
    const talent = cardsOf(events).find((c) => c.kind === "talent")! as unknown as { summary: { sharedTaste: number | null; sharedTags: string[] }; warnings: Array<{ message?: string }> };
    expect(talent.summary).toEqual({ sharedTaste: null, sharedTags: [] });
    expect(talent.warnings.map((w) => w.message)).toContain("shared taste unavailable for city mainstream");
  });
  it("venue rank is called with place entity ids, not names", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_rank") seen.push(a); return happy(t, a); }), cities: CITIES }));
    expect(seen[0]!.options).toEqual(["E0", "E1", "E2", "E3"]);
    expect(cardsOf(events).find((c) => c.kind === "venue_fit")!.items.map((i) => i.name)).toEqual(["Venue A", "Venue B"]);
  });
  it("a rank needs_input keeps the top 3 place recommendations by affinity with a partial warning", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => (t === "qloo_rank" ? liveEnv("rank-needs-input") : happy(t, a))), cities: CITIES }));
    const venue = cardsOf(events).find((c) => c.kind === "venue_fit")!;
    expect(venue.status).toBe("ok");
    expect(venue.items.map((i) => i.name)).toEqual(["Place 2", "Place 4", "Place 3"]);
    expect(venue.warnings).toContainEqual(expect.objectContaining({ kind: "partial", message: "venue ranking unresolved — showing place recommendations" }));
  });
  it("a needs_input talent proxy or co-bill compare adds a partial warning instead of failing silently", async () => {
    const ni = (t: string): QlooEnvelope => ({ operation: t, status: "needs_input", summary: "Provide at least one entity, tag, location, or demographic taste signal.", results: null } as unknown as QlooEnvelope);
    const proxyEvents = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => (t === "qloo_recommend" && !a.signals ? ni(t) : happy(t, a))), cities: CITIES }));
    const talent = cardsOf(proxyEvents).find((c) => c.kind === "talent")!;
    expect(talent.warnings).toContainEqual(expect.objectContaining({ tool: "qloo_recommend", kind: "partial", message: expect.stringContaining("Provide at least one") }));
    const cmpEvents = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => (t === "qloo_compare_audiences" ? ni(t) : happy(t, a))), cities: CITIES }));
    const cards = cardsOf(cmpEvents);
    expect(cards.find((c) => c.kind === "co_billing")!.warnings).toContainEqual(expect.objectContaining({ tool: "qloo_compare_audiences", kind: "partial", message: expect.stringContaining("Provide at least one") }));
    expect(cards.find((c) => c.kind === "talent")!.warnings).toContainEqual(expect.objectContaining({ tool: "qloo_compare_audiences", kind: "partial", message: expect.stringContaining("Provide at least one") }));
  });
  it("local_moment interleaves sources so artists do not crowd out the rest", async () => {
    const names = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => {
        if (t !== "qloo_recommend") return happy(t, a);
        const m: Record<string, [string, number]> = { artist: ["Art", 10], movie: ["Film", 2], tv_show: ["Tv", 1], place: ["Place", 2] };
        const [p, n] = m[String(a.target_type)] ?? ["Brand", 2];
        return recs(names(p, n), names(p, n).map(() => 0.5));
      }),
      cities: CITIES,
    }));
    const items = cardsOf(events).find((c) => c.kind === "local_moment")!.items.map((i) => String(i.name));
    expect(items).toHaveLength(9);
    expect(items.filter((n) => n.startsWith("Art"))).toHaveLength(4);
    for (const n of ["Film0", "Film1", "Tv0", "Place0", "Place1"]) expect(items).toContain(n);
  });
  it("local_moment includes tv items when only tv returns results", async () => {
    const empty = (t: string): QlooEnvelope => ({ operation: t, status: "empty", results: [] });
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_recommend" && a.target_type === "tv_show" ? recs(["Show 1"], [0.6]) : empty(t))),
      cities: CITIES,
    }));
    const lm = cardsOf(events).find((c) => c.kind === "local_moment")!;
    expect(lm.items.map((i) => i.name)).toEqual(["Show 1"]);
  });

  describe("hybrid local acts", () => {
    const sug = (...names: string[]) => ({ localActs: async () => names });
    const entity = (id: string, name: string, affinity?: number): QlooEnvelope => ({ operation: "describe", status: "ok", results: [{ entity_id: id, name, ...(affinity === undefined ? {} : { affinity }) }] });
    const nameOf = new Map<string, string>([["P0", "Proxy 1"], ["P1", "Proxy 2"]]);
    // describe: "Drake" -> S-Drake; "Proxy 1" resolves to the pool's own P0; "Ghost" is unknown to Qloo.
    const hybrid = (t: string, a: Record<string, unknown>): QlooEnvelope => {
      if (t === "qloo_describe") {
        const n = String(a.entity);
        if (n === "Ghost") return { operation: "describe", status: "empty", results: [] };
        if (n === "Proxy 1") return entity("P0", "Proxy 1");
        return entity(`S-${n}`, n);
      }
      if (t === "qloo_rank" && a.option_type === "artist") {
        const ids = [...(a.options as string[])].reverse();
        return { operation: "rank", status: "ok", results: ids.map((id, i) => ({ entity_id: id, name: id.startsWith("S-") ? id.slice(2) : nameOf.get(id) ?? id, affinity: 0.9 - i * 0.1 })) };
      }
      return happy(t, a);
    };
    type TalentCard = { items: Array<{ name: string; entityId: string; affinity: number; source?: string }>; refs: Array<{ tool: string }>; warnings: Array<{ tool: string; message?: string }>; summary: Record<string, unknown> };
    const talentOf = (events: GatewayEvent[]) => cardsOf(events).find((c) => c.kind === "talent")! as unknown as TalentCard;

    it("resolves suggestions in Qloo, merges them ahead of the city pool, dedupes by entityId and labels the source", async () => {
      const ranks: Array<Record<string, unknown>> = [];
      const describes: Array<Record<string, unknown>> = [];
      const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_describe") describes.push(a); if (t === "qloo_rank" && a.option_type === "artist") ranks.push(a); return hybrid(t, a); }), cities: CITIES, ...sug("Drake", "Proxy 1") }));
      expect(describes).toEqual([{ entity: "Drake", type: "artist" }]); // "Proxy 1" is already in the city pool: no describe
      expect(ranks).toEqual([localActRankArgs("A1", "Mexico City, MX", ["S-Drake", "P0", "P1"])]);
      const t = talentOf(events);
      expect(t.items.map((i) => [i.entityId, i.source])).toEqual([["P1", "city_popular"], ["P0", "suggested"], ["S-Drake", "suggested"]]);
      expect(t.items[0]).toEqual({ name: "Proxy 2", entityId: "P1", affinity: 0.9, source: "city_popular" });
      expect(t.refs.map((r) => r.tool)).toEqual(["qloo_recommend", "qloo_describe", "qloo_rank", "qloo_compare_audiences"]);
    });
    it("a suggestion whose name matches a city-pool artist reuses the pool entity without a describe", async () => {
      const describes: string[] = [];
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo((tool, a) => { if (tool === "qloo_describe") describes.push(String(a.entity)); return hybrid(tool, a); }), cities: CITIES, ...sug("proxy  1", "PROXY 2") })));
      expect(describes).toEqual([]);
      expect(t.items.map((i) => [i.entityId, i.source])).toEqual([["P1", "suggested"], ["P0", "suggested"]]);
      expect(t.summary.suggestionsUnresolved).toBe(0);
    });
    it("describes at most 5 suggestions, the first 5 not already matched in the pool", async () => {
      const describes: string[] = [];
      const names = ["Proxy 1", ...Array.from({ length: 8 }, (_, i) => `Act ${i}`)];
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo((tool, a) => { if (tool === "qloo_describe") describes.push(String(a.entity)); return hybrid(tool, a); }), cities: CITIES, ...sug(...names) })));
      expect(describes).toEqual(["Act 0", "Act 1", "Act 2", "Act 3", "Act 4"]);
      expect(t.summary.suggestionsUnresolved).toBe(3);
    });
    it("keeps the popular-only rank warning when every resolved suggestion duplicates the pool", async () => {
      const empty = { operation: "rank", status: "empty", results: [] } as QlooEnvelope;
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo((tool, a) => (tool === "qloo_rank" && a.option_type === "artist" ? empty : hybrid(tool, a))), cities: CITIES, ...sug("Proxy 1", "Ghost") })));
      expect(t.warnings).toContainEqual({ tool: "qloo_rank", kind: "partial", message: "taste ranking unavailable — showing the city's most popular artists" });
    });
    it("drops suggestions Qloo cannot find and counts them; they never reach the card", async () => {
      const events = await collect(runCityPlaybook(input, { qloo: qloo(hybrid), cities: CITIES, ...sug("Ghost", "Drake") }));
      const t = talentOf(events);
      expect(JSON.stringify(t)).not.toContain("Ghost");
      expect(t.summary.suggestionsUnresolved).toBe(1);
      expect(t.items.map((i) => i.name)).toContain("Drake");
    });
    it("a describe that throws counts as unresolved", async () => {
      const throwing: QlooCaller = { async call(tool, args) { if (tool === "qloo_describe" && args.entity === "Boom") throw new Error("boom"); return { envelope: hybrid(tool, args), cacheKey: "k", cached: false, stale: false }; } };
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: throwing, cities: CITIES, ...sug("Boom", "Drake") })));
      expect(t.summary.suggestionsUnresolved).toBe(1);
      expect(t.items.map((i) => i.name)).toContain("Drake");
    });
    it("null suggestions behave exactly like the city-pool-only card: no source, no summary field, no describe", async () => {
      let describes = 0;
      const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_describe") describes += 1; return happy(t, a); }), cities: CITIES, localActs: async () => null }));
      const t = talentOf(events);
      expect(describes).toBe(0);
      expect(t.items).toEqual([{ name: "Proxy 2", entityId: "P0", affinity: 0.95 }, { name: "Proxy 1", entityId: "P1", affinity: 0.4 }]);
      expect(t.summary).toEqual({ sharedTaste: expect.any(Number), sharedTags: ["Funk", "Soul", "Pop"] }); // ranked: no rankUnavailable flag
      expect(t.warnings).toEqual([]);
    });
    it("rank failure falls back to candidate order (suggestions first) with the existing warning", async () => {
      const empty = { operation: "rank", status: "empty", results: [] } as QlooEnvelope;
      const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => (t === "qloo_rank" && a.option_type === "artist" ? empty : hybrid(t, a))), cities: CITIES, ...sug("Drake") }));
      const t = talentOf(events);
      expect(t.items.map((i) => [i.name, i.source])).toEqual([["Drake", "suggested"], ["Proxy 1", "city_popular"], ["Proxy 2", "city_popular"]]);
      expect(t.warnings).toContainEqual({ tool: "qloo_rank", kind: "partial", message: "taste ranking unavailable — showing suggested and popular artists unranked" });
      expect(t.summary.rankUnavailable).toBe(true);
    });
    it("a suggestion counts only if Qloo resolves the same name", async () => {
      const results = (...names: string[]): QlooEnvelope => ({ operation: "describe", status: "ok", results: names.map((n, i) => ({ entity_id: `D${i}-${n}`, name: n })) });
      const route = (t: string, a: Record<string, unknown>): QlooEnvelope => {
        if (t !== "qloo_describe") return hybrid(t, a);
        switch (a.entity) {
          case "Drake": return results("Drake Bell");
          case "Mana": return results("Maná");
          case "Anitta": return results("Anitta Fan Club", "Anitta");
          case "Bad & Co": return results("Bad and Co.");
          case "Needy": return { operation: "describe", status: "needs_input", results: [{ entity_id: "N1", name: "Needy" }] } as QlooEnvelope;
          default: return hybrid(t, a);
        }
      };
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo(route), cities: CITIES, ...sug("Drake", "Mana", "Anitta", "Bad & Co", "Needy") })));
      const ids = t.items.map((i) => i.entityId);
      expect(ids).toEqual(expect.arrayContaining(["D0-Maná", "D1-Anitta", "D0-Bad and Co."]));
      expect(JSON.stringify(ids)).not.toMatch(/Drake|Fan Club|N1/);
      expect(t.summary.suggestionsUnresolved).toBe(2);
    });
    it("rank failure with no suggestions keeps the 3b warning wording", async () => {
      const empty = { operation: "rank", status: "empty", results: [] } as QlooEnvelope;
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo((tool, a) => (tool === "qloo_rank" && a.option_type === "artist" ? empty : happy(tool, a))), cities: CITIES })));
      expect(t.warnings.map((w) => w.message)).toContain("taste ranking unavailable — showing the city's most popular artists");
    });
    it("sharedTaste still compares the first 5 of the city pool, not the suggestions", async () => {
      const cmps: Array<Record<string, unknown>> = [];
      await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_compare_audiences" && (a.group_b as string[]).length > 1) cmps.push(a); return hybrid(t, a); }), cities: CITIES, ...sug("Drake") }));
      expect(cmps.map((a) => a.group_b)).toEqual([["P0", "P1"]]);
    });
    it("works when the city pool is empty but suggestions resolve", async () => {
      const t = talentOf(await collect(runCityPlaybook(input, { qloo: qloo((tool, a) => (tool === "qloo_recommend" && !a.signals ? { operation: "recommend", status: "empty", results: [] } : hybrid(tool, a))), cities: CITIES, ...sug("Drake") })));
      expect(t.items.map((i) => [i.name, i.source])).toEqual([["Drake", "suggested"]]);
    });
    it("a cold playbook with ten suggestions makes at most 40 Qloo calls", async () => {
      let calls = 0;
      const names = Array.from({ length: 10 }, (_, i) => `Act ${i}`);
      const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { calls += 1; return hybrid(t, a); }), cities: CITIES, ...sug(...names) }));
      expect(events.at(-1)?.type).toBe("done");
      expect(calls).toBeLessThanOrEqual(40);
    });
  });
});
