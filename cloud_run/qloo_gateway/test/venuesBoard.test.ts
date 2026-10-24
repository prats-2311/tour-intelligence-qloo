import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { activationInputs, runTourBoard, type TourBrief } from "../src/pipeline/tourBoard.js";
import { VENUE_CATEGORY_TAGS } from "../src/pipeline/venues.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { describeOk, recs } from "./fixtures/envelopes.js";

// Invented city and venues. Ids use the 00000000- prefix.
const EP: City = { id: "9001", name: "El Testo", country: "ZZ", lat: 31.76, lon: -106.49, population: 700_000 };
const CITIES: City[] = [EP];
const near = (c: City): QlooEnvelope => ({ operation: "where_popular", status: "ok", results: [[0, 0, 0.8], [0.01, 0.01, 0.5], [-0.01, 0, 0.3]].map(([a, b, aff]) => ({ location: { latitude: c.lat + a!, longitude: c.lon + b! }, query: { affinity: aff!, popularity: 0.3 } })) });
const place = (n: string, city?: string, cc = "ZZ"): Record<string, unknown> => ({
  entity_id: `00000000-venue-${n}`, name: `Venue ${n}`, subtype: "urn:entity:place", affinity: 0.9, popularity: 0.5,
  ...(city === undefined ? {} : { properties: { geocode: { city, country_code: cc } } }),
});
const MIXED = [place("same1", "El Testo"), place("town", "Sunny Park"), place("abroad", "El Testo", "YY"), place("nogeo"), place("same2", "EL TESTÓ")];
const placeEnv = (results: unknown[]): QlooEnvelope => ({ operation: "recommend", status: "ok", results } as QlooEnvelope);
type Call = { tool: string; args: Record<string, unknown> };
function fake(places: unknown[], calls: Call[]): QlooCaller {
  return {
    async call(tool, args) {
      calls.push({ tool, args });
      const env = ((): QlooEnvelope => {
        if (tool === "qloo_describe") return describeOk;
        if (tool === "qloo_where_popular") return args.within === "Land" ? near(EP) : near(EP);
        if (tool === "qloo_recommend") return args.target_type === "place" ? placeEnv(places) : recs(["One", "Two", "Three"], [0.9, 0.8, 0.7]);
        if (tool === "qloo_rank") return { operation: "rank", status: "ok", results: (args.options as string[]).map((id, i) => ({ entity_id: id, name: id.replace("00000000-venue-", "Ranked "), affinity: 0.9 - i * 0.1 })) } as QlooEnvelope;
        return { operation: tool, status: "ok", results: [] };
      })();
      return { envelope: env, cacheKey: `${tool}:${calls.length}`, cached: false, stale: false };
    },
  };
}
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
const brief: TourBrief = { artist: "Test Artist", regions: ["Land"], maxStops: 8, sessionId: "s", today: "2026-10-20" };
type Scored = { city: { activation: { components: Record<string, number> } } };

describe("board venues", () => {
  it("asks Qloo for music-venue categories (union) in the city's location", async () => {
    const calls: Call[] = [];
    await collect(runTourBoard(brief, { qloo: fake(MIXED, calls), cities: CITIES }));
    const placeCall = calls.find((c) => c.tool === "qloo_recommend" && c.args.target_type === "place")!;
    expect(placeCall.args).toEqual({ target_type: "place", signals: ["A1"], filter_location: "El Testo, ZZ", include_tags: [...VENUE_CATEGORY_TAGS], include_tags_operator: "union", limit: 20 });
  });

  it("ranks only the same-city, same-country venues", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief, { qloo: fake(MIXED, calls), cities: CITIES }));
    const rank = calls.find((c) => c.tool === "qloo_rank")!;
    expect(rank.args.options).toEqual(["00000000-venue-same1", "00000000-venue-same2"]);
    const scored = events.find((e) => e.type === "city_scored") as unknown as Scored;
    expect(scored.city.activation.components.venue_fit).toBeDefined();
  });

  it("with no qualifying venue there is no rank call and no venue_fit", async () => {
    const calls: Call[] = [];
    const events = await collect(runTourBoard(brief, { qloo: fake([place("town", "Sunny Park"), place("abroad", "El Testo", "YY"), place("nogeo")], calls), cities: CITIES }));
    expect(calls.filter((c) => c.tool === "qloo_rank")).toEqual([]);
    const scored = events.find((e) => e.type === "city_scored") as unknown as Scored;
    expect(scored.city.activation.components.venue_fit).toBeUndefined();
  });

  it("one qualifying venue still scores venue_fit from what exists", async () => {
    const events = await collect(runTourBoard(brief, { qloo: fake([place("only", "El Testo")], []), cities: CITIES }));
    const scored = events.find((e) => e.type === "city_scored") as unknown as Scored;
    expect(scored.city.activation.components.venue_fit).toBeDefined();
  });
});

describe("playbook venues", () => {
  const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "El Testo", country: "ZZ" }, sessionId: "s" };
  const cardOf = (events: GatewayEvent[], kind: string) => (events.find((e) => e.type === "playbook") as { playbook: { cards: Array<{ kind: string; status: string; items: Array<{ name: string }>; warnings: Array<{ message?: string }> }> } }).playbook.cards.find((c) => c.kind === kind)!;

  it("the venue card lists only same-city venues", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: fake(MIXED, []), cities: CITIES }));
    expect(cardOf(events, "venue_fit").items.map((i) => i.name)).toEqual(["Ranked same1", "Ranked same2"]);
  });

  it("with none, the card is empty and says so; it is never padded", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: fake([place("town", "Sunny Park")], []), cities: CITIES }));
    const card = cardOf(events, "venue_fit");
    expect(card.status).toBe("empty");
    expect(card.items).toEqual([]);
    expect(card.warnings.map((w) => w.message)).toContain("Qloo lists no music venues in El Testo for this artist");
    // The local-moment card does not borrow the dropped places either.
    expect(cardOf(events, "local_moment").items.map((i) => i.name)).not.toContain("Venue town");
  });
});

describe("activationInputs", () => {
  it("falls back to the same-city places by affinity if the rank answers nothing", async () => {
    const calls: Call[] = [];
    const base = fake(MIXED, calls);
    const qloo: QlooCaller = { async call(t, a, s) { return t === "qloo_rank" ? { envelope: { operation: "rank", status: "ok", results: [] }, cacheKey: "r", cached: false, stale: false } : base.call(t, a, s); } };
    const inCity = await qloo.call("qloo_where_popular", {}, "s");
    const out = await activationInputs("A1", { where: "El Testo, ZZ", inCity, city: EP }, { qloo, cities: CITIES }, "s", []);
    expect(out.venues.items.map((i) => i.name)).toEqual(["Venue same1", "Venue same2"]);
  });
});
