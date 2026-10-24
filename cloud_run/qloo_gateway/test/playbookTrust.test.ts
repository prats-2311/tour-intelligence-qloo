import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { cityPopularityArgs, localActRankArgs } from "../src/pipeline/recArgs.js";
import { activationInputs } from "../src/pipeline/tourBoard.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat } from "./fixtures/envelopes.js";

const CITIES: City[] = [
  { id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 },
  { id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 },
];
const WHERE = "Mexico City, MX";
type Row = { id: string; name: string; aff: number; pop?: number };
const list = (rows: Row[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results: rows.map((r) => ({ entity_id: r.id, name: r.name, affinity: r.aff, ...(r.pop === undefined ? {} : { popularity: r.pop }) })) });
const tag = (id: string, name: string, score: number) => ({ tag_id: id, name, type: "urn:tag", query: { score } });
const compareWith = (...tags: ReturnType<typeof tag>[]): QlooEnvelope => ({ operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags } });

interface Fake { brands: Row[]; brandBase: Row[]; movies: Row[]; movieBase: Row[]; tvs: Row[]; tvBase: Row[]; artists: Row[]; pool: Row[]; heat: QlooEnvelope; compare: QlooEnvelope; describePop: number | undefined }
const base = (): Fake => ({
  brands: [{ id: "B1", name: "Brand One", aff: 0.9 }, { id: "B2", name: "Brand Two", aff: 0.75 }, { id: "B3", name: "Brand Three", aff: 0.7 }],
  brandBase: [{ id: "B1", name: "Brand One", aff: 0.85 }, { id: "B2", name: "Brand Two", aff: 0.5 }, { id: "B9", name: "Brand Nine", aff: 0.4 }],
  movies: [{ id: "M1", name: "Film One", aff: 0.8 }, { id: "M2", name: "Film Two", aff: 0.6 }],
  movieBase: [{ id: "M1", name: "Film One", aff: 0.78 }, { id: "M2", name: "Film Two", aff: 0.2 }],
  tvs: [{ id: "T1", name: "Show One", aff: 0.7 }, { id: "T2", name: "Show Two", aff: 0.65 }],
  tvBase: [{ id: "T1", name: "Show One", aff: 0.69 }, { id: "T2", name: "Show Two", aff: 0.3 }],
  artists: [{ id: "C1", name: "Small Act", aff: 0.9, pop: 0.3 }],
  pool: [{ id: "P0", name: "Pool Small", aff: 0.7, pop: 0.2 }],
  heat: cityHeat,
  compare: compareWith(tag("urn:tag:genre:music:funk", "Funk", 0.9)),
  describePop: 0.6,
});
interface Calls { recommend: Array<Record<string, unknown>>; all: Array<[string, Record<string, unknown>]> }
function fakeQloo(f: Fake, calls: Calls = { recommend: [], all: [] }): QlooCaller {
  let n = 0;
  return {
    async call(tool, args) {
      n += 1;
      calls.all.push([tool, args]);
      const envelope = ((): QlooEnvelope => {
        if (tool === "qloo_where_popular") return f.heat;
        if (tool === "qloo_describe") return { operation: "describe", status: "ok", results: [{ entity_id: "A1", name: "Test Artist", ...(f.describePop === undefined ? {} : { popularity: f.describePop }) }] };
        if (tool === "qloo_entity_tags") return { operation: "tags", status: "ok", results: [] };
        if (tool === "qloo_compare_audiences") return f.compare;
        if (tool === "qloo_rank") return list((args.options as string[]).map((id, i) => ({ id, name: `R-${id}`, aff: 0.9 - i * 0.1 })));
        if (tool === "qloo_recommend") {
          calls.recommend.push(args);
          const signed = Boolean(args.signals);
          switch (args.target_type) {
            case "brand": return list(signed ? f.brands : f.brandBase);
            case "movie": return list(signed ? f.movies : f.movieBase);
            case "tv_show": return list(signed ? f.tvs : f.tvBase);
            case "artist": return list(signed ? f.artists : f.pool);
            case "place": return { operation: "recommend", status: "ok", results: [] };
          }
        }
        return { operation: tool, status: "empty", results: [] };
      })();
      return { envelope, cacheKey: `k${n}`, cached: false, stale: false };
    },
  };
}
const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s", artistPopularity: 0.6 };
async function run(f: Fake, over: Partial<typeof input> = {}, calls?: Calls) {
  const events: GatewayEvent[] = [];
  for await (const e of runCityPlaybook({ ...input, ...over }, { qloo: fakeQloo(f, calls), cities: CITIES })) events.push(e);
  expect(events.filter((e) => e.type === "error")).toEqual([]);
  const cards = (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; status: string; items: Array<Record<string, any>>; summary?: Record<string, any>; warnings: unknown[] }> } }).playbook.cards;
  return { cards, card: (k: string) => cards.find((c) => c.kind === k)! };
}

describe("sponsor lift against the city baseline", () => {
  it("asks for one city-baseline brand list and sorts brands by lift", async () => {
    const calls: Calls = { recommend: [], all: [] };
    const { card } = await run(base(), {}, calls);
    expect(calls.recommend.filter((a) => a.target_type === "brand" && !a.signals)).toEqual([cityPopularityArgs("brand", WHERE, 20)]);
    const items = card("sponsors").items;
    expect(items.map((i) => i.name)).toEqual(["Brand Three", "Brand Two", "Brand One"]);
    expect(items[0]).toMatchObject({ baselineAffinity: 0.4, baselineMissing: true });
    expect(items[0]!.lift).toBeCloseTo(0.3, 10);
    expect(items[1]).toMatchObject({ baselineAffinity: 0.5, baselineMissing: false });
    expect(items[1]!.lift).toBeCloseTo(0.25, 10);
    expect(items[2]!.lift).toBeCloseTo(0.05, 10);
    expect(card("sponsors").summary?.note).toBe("Ranked by how much more this artist's fans like the brand than the city overall.");
  });
  it("breaks lift ties by affinity", async () => {
    const f = base();
    f.brands = [{ id: "B5", name: "Low", aff: 0.5 }, { id: "B4", name: "High", aff: 0.75 }];
    f.brandBase = [{ id: "B5", name: "Low", aff: 0.25 }, { id: "B4", name: "High", aff: 0.5 }];
    expect((await run(f)).card("sponsors").items.map((i) => i.name)).toEqual(["High", "Low"]);
  });
  it("keeps Qloo order and omits lift when the baseline is unavailable", async () => {
    const f = base();
    f.brandBase = [];
    const s = (await run(f)).card("sponsors");
    expect(s.items.map((i) => i.name)).toEqual(["Brand One", "Brand Two", "Brand Three"]);
    expect(s.items[0]).not.toHaveProperty("lift");
    expect(s.summary?.note).toBeUndefined();
  });
  it("merch cites the top-lift brands", async () => {
    const f = base();
    expect((await run(f)).card("merch").summary?.brands).toEqual(["Brand Three", "Brand Two", "Brand One"]);
  });
  it("leaves the board activation (sponsor_fit = raw affinity) byte-identical whatever the baseline says", async () => {
    const drive = async (f: Fake) => {
      const a = await activationInputs("A1", { where: WHERE, inCity: (await fakeQloo(f).call("qloo_where_popular", {}, "s")), city: CITIES[0]! }, { qloo: fakeQloo(f), cities: CITIES }, "s", []);
      return JSON.stringify({ c: a.components, r: a.rawComponents, z: a.zones });
    };
    const other = base();
    other.brandBase = [{ id: "B1", name: "Brand One", aff: 0.1 }];
    other.movieBase = []; other.tvBase = [];
    expect(await drive(base())).toBe(await drive(other));
    const sponsorFit = (JSON.parse(await drive(base())) as { r: { sponsor_fit: number } }).r.sponsor_fit;
    expect(sponsorFit).toBeCloseTo((0.9 + 0.75 + 0.7) / 3, 10);
  });
});

describe("local moment lift", () => {
  it("lifts movies and tv against one baseline call each; places and artists keep their order", async () => {
    const calls: Calls = { recommend: [], all: [] };
    const f = base();
    f.artists = [{ id: "C1", name: "Art A", aff: 0.9, pop: 0.3 }, { id: "C2", name: "Art B", aff: 0.8, pop: 0.3 }];
    const { card } = await run(f, {}, calls);
    expect(calls.recommend.filter((a) => a.target_type === "movie" && !a.signals)).toEqual([cityPopularityArgs("movie", WHERE, 20)]);
    expect(calls.recommend.filter((a) => a.target_type === "tv_show" && !a.signals)).toEqual([cityPopularityArgs("tv_show", WHERE, 20)]);
    const items = card("local_moment").items;
    expect(items.filter((i) => ["Art A", "Art B"].includes(i.name)).map((i) => i.name)).toEqual(["Art A", "Art B"]);
    expect(items.filter((i) => i.name.startsWith("Film")).map((i) => i.name)).toEqual(["Film Two", "Film One"]);
    expect(items.filter((i) => i.name.startsWith("Show")).map((i) => i.name)).toEqual(["Show Two", "Show One"]);
    expect(items.find((i) => i.name === "Film Two")).toMatchObject({ baselineAffinity: 0.2, baselineMissing: false });
    expect(items.find((i) => i.name === "Art A")).not.toHaveProperty("lift");
  });
  it("a title that is equally liked everywhere gets no lift", async () => {
    const f = base();
    f.movies = [{ id: "M1", name: "Everywhere", aff: 0.8 }, { id: "M2", name: "Local", aff: 0.6 }];
    f.movieBase = [{ id: "M1", name: "Everywhere", aff: 0.8 }, { id: "M2", name: "Local", aff: 0.2 }];
    const films = (await run(f)).card("local_moment").items.filter((i) => ["Everywhere", "Local"].includes(i.name));
    expect(films.map((i) => i.name)).toEqual(["Local", "Everywhere"]);
    expect(films[1]!.lift).toBeCloseTo(0, 10);
  });
});

describe("support-act scale", () => {
  it("co-billing keeps only acts strictly smaller than the headliner and counts the rest", async () => {
    const f = base();
    f.artists = [
      { id: "C1", name: "Big Act", aff: 0.9, pop: 0.95 },
      { id: "C2", name: "Same Size", aff: 0.9, pop: 0.6 },
      { id: "C3", name: "Small Act", aff: 0.8, pop: 0.3 },
      { id: "C4", name: "No Popularity", aff: 0.7 },
    ];
    const calls: Calls = { recommend: [], all: [] };
    const { card } = await run(f, {}, calls);
    const co = card("co_billing");
    expect(co.items.map((i) => i.name)).toEqual(["Small Act"]);
    expect(co.summary).toMatchObject({ biggerThanHeadliner: 2, popularityUnknown: 1 });
    expect(calls.all.filter(([t, a]) => t === "qloo_compare_audiences" && (a.group_b as string[])[0]!.startsWith("C")).map(([, a]) => a.group_b)).toEqual([["C3"]]);
  });
  it("co-billing is empty with the scale copy when every match is bigger", async () => {
    const f = base();
    f.artists = [{ id: "C1", name: "Big Act", aff: 0.9, pop: 0.95 }];
    const co = (await run(f)).card("co_billing");
    expect(co.status).toBe("empty");
    expect(co.summary?.emptyCopy).toBe("Every Qloo match is bigger than Test Artist, so no support pick here.");
  });
  it("local acts drop bigger-than-headliner and unknown-size candidates before ranking", async () => {
    const f = base();
    f.pool = [{ id: "P0", name: "Huge", aff: 0.9, pop: 0.99 }, { id: "P1", name: "Small", aff: 0.8, pop: 0.2 }, { id: "P2", name: "Unknown", aff: 0.7 }];
    const calls: Calls = { recommend: [], all: [] };
    const { card } = await run(f, {}, calls);
    const rank = calls.all.find(([t, a]) => t === "qloo_rank" && a.option_type === "artist")![1];
    expect(rank).toEqual(localActRankArgs("A1", WHERE, ["P1"]));
    const talent = card("talent");
    expect(talent.items.map((i) => i.entityId)).toEqual(["P1"]);
    expect(talent.summary).toMatchObject({ biggerThanHeadliner: 1, popularityUnknown: 1 });
  });
  it("local acts are empty with the scale copy when all are bigger", async () => {
    const f = base();
    f.pool = [{ id: "P0", name: "Huge", aff: 0.9, pop: 0.99 }];
    const talent = (await run(f)).card("talent");
    expect(talent.status).toBe("empty");
    expect(talent.summary?.emptyCopy).toBe("Every Qloo match is bigger than Test Artist, so no support pick here.");
  });
  it("looks the headliner up once (cached describe) when the caller gives no popularity, and filters with it", async () => {
    const f = base();
    f.artists = [{ id: "C1", name: "Big Act", aff: 0.9, pop: 0.95 }, { id: "C3", name: "Small Act", aff: 0.8, pop: 0.3 }];
    const calls: Calls = { recommend: [], all: [] };
    const { card } = await run(f, { artistPopularity: undefined } as never, calls);
    expect(calls.all.filter(([t]) => t === "qloo_describe")).toEqual([["qloo_describe", { entity: "Test Artist", type: "artist" }]]);
    expect(card("co_billing").items.map((i) => i.name)).toEqual(["Small Act"]);
  });
  it("does not filter, and says so, when the headliner's popularity is unknown", async () => {
    const f = base();
    f.describePop = undefined;
    f.artists = [{ id: "C1", name: "Big Act", aff: 0.9, pop: 0.95 }];
    const co = (await run(f, { artistPopularity: undefined } as never)).card("co_billing");
    expect(co.items.map((i) => i.name)).toEqual(["Big Act"]);
    expect(co.warnings).toContainEqual(expect.objectContaining({ kind: "partial", message: "headliner popularity unavailable, support acts not size-checked" }));
  });
});

describe("genre-only chips", () => {
  const mixed = compareWith(
    tag("urn:tag:keyword:united-states", "United States", 0.99),
    tag("urn:tag:genre:music:folk", "Folk", 0.9),
    tag("qloo:popularity:high", "High popularity", 0.85),
    tag("urn:tag:genre:music:indie", "Indie", 0.8),
    tag("urn:tag:location:uk", "United Kingdom", 0.7),
  );
  it("co-billing and talent chips keep only urn:tag:genre tags", async () => {
    const f = base();
    f.compare = mixed;
    const { card } = await run(f);
    expect(card("co_billing").items[0]!.sharedTags).toEqual(["Folk", "Indie"]);
    expect(card("talent").summary?.sharedTags).toEqual(["Folk", "Indie"]);
  });
});

describe("zones", () => {
  it("labels the city's own name Central <city>, merges, and sorts by share descending", async () => {
    const f = base();
    f.heat = { operation: "where_popular", status: "ok", results: [
      { location: { latitude: 19.43, longitude: -99.13 }, query: { affinity: 0.4, popularity: 0.2 } },
      { location: { latitude: 19.35, longitude: -99.16 }, query: { affinity: 0.35, popularity: 0.2 } },
      { location: { latitude: 19.351, longitude: -99.161 }, query: { affinity: 0.25, popularity: 0.2 } },
    ] };
    const zones = (await run(f)).card("promo_zones").items;
    expect(zones.map((z) => z.label)).toEqual(["Coyoacan", "Central Mexico City"]);
    expect(zones[0]!.share).toBeCloseTo(0.6, 10);
    expect(zones.map((z) => z.share)).toEqual([...zones.map((z) => z.share)].sort((a, b) => b - a));
  });
  it("accent-folds the match", async () => {
    const f = base();
    const accented: City[] = [{ ...CITIES[0]!, name: "México City" }, CITIES[1]!];
    const events: GatewayEvent[] = [];
    for await (const e of runCityPlaybook(input, { qloo: fakeQloo(f), cities: accented })) events.push(e);
    const zones = (events.find((e) => e.type === "playbook") as any).playbook.cards.find((c: any) => c.kind === "promo_zones").items;
    expect(zones.map((z: any) => z.label)).toContain("Central México City");
  });
});
