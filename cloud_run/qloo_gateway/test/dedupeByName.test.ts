import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import { dedupeByName } from "../src/pipeline/playbookTrust.js";
import { runSponsorSegments } from "../src/pipeline/sponsorSegments.js";
import type { CallResult, QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, placesIn } from "./fixtures/envelopes.js";

describe("dedupeByName", () => {
  it("keeps the first of identical, case- and accent-folded names", () => {
    const out = dedupeByName([{ name: "Fjällräven", n: 1 }, { name: "Vans", n: 2 }, { name: "FJALLRAVEN ", n: 3 }, { name: "fjällräven", n: 4 }]);
    expect(out.map((x) => x.n)).toEqual([1, 2]);
  });
  it("keeps items without a usable name", () => {
    expect(dedupeByName([{ name: "" }, { name: "" }]).length).toBe(2);
  });
});

const CITIES: City[] = [{ id: "1", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, population: 9_000_000 }];
const list = (names: string[], idPrefix = "E"): QlooEnvelope => ({ operation: "recommend", status: "ok", results: names.map((name, i) => ({ entity_id: `${idPrefix}${i}`, name, affinity: 0.9 - i / 100, popularity: 0.5 })) });
const call = (envelope: QlooEnvelope): CallResult => ({ envelope, cacheKey: "k", cached: false, stale: false });
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
type Cards = Array<{ kind: string; items: Array<Record<string, unknown>> }>;

describe("playbook cards collapse duplicate names", () => {
  const qloo: QlooCaller = {
    async call(tool, args) {
      if (tool === "qloo_where_popular") return call(cityHeat);
      if (tool === "qloo_compare_audiences") return call({ operation: "compare_audiences", status: "ok", results: { a: [], b: [], matchEntities: [], tags: [] } });
      if (tool === "qloo_entity_tags") return call({ operation: "tags", status: "ok", results: [] });
      if (tool === "qloo_rank") return call(list(["Venue A", "venue a", "Venue B", "Venue C", "Venue D"], "R"));
      if (args.signals === undefined) return call(list(["Z"], "B"));
      if (args.target_type === "brand") return call(list(["Fjällräven", "Vans", "Obey", "Fjallraven", "Converse"], "BR"));
      if (args.target_type === "movie") return call(list(["Film A", "FILM A", "Film B"], "M"));
      if (args.target_type === "tv_show") return call(list(["Show A", "Show A", "Show B"], "T"));
      if (args.target_type === "artist") return call(list(["Act 1", "act 1", "Act 2", "Act 3", "Act 4"], "AR"));
      if (args.target_type === "place") return call(placesIn(args.filter_location, ["Place 1", "place 1", "Place 2", "Place 3"], [0.9, 0.8, 0.7, 0.6]));
      return call(list(["X"]));
    },
  };
  it("sponsors, local moment, venues and co-billing show each name once, and fill from the next distinct item", async () => {
    const events = await collect(runCityPlaybook({ artist: "T", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s", artistPopularity: 0.99 }, { qloo, cities: CITIES }));
    const cards = (events.find((e) => e.type === "playbook") as { playbook: { cards: Cards } }).playbook.cards;
    const names = (k: string) => cards.find((c) => c.kind === k)!.items.map((i) => i.name as string);
    expect(names("sponsors")).toEqual(["Fjällräven", "Vans", "Obey", "Converse"]);
    const moment = names("local_moment").map((n) => n.toLowerCase());
    expect(new Set(moment).size).toBe(moment.length);
    const v = names("venue_fit").map((n) => n.toLowerCase());
    expect(new Set(v).size).toBe(v.length);
    expect(v.length).toBe(3);
    const co = names("co_billing").map((n) => n.toLowerCase());
    expect(new Set(co).size).toBe(co.length);
    const talent = names("talent").map((n) => n.toLowerCase());
    expect(new Set(talent).size).toBe(talent.length);
  });
});

describe("sponsor segments collapse duplicate names", () => {
  it("age-group lists show a brand once", async () => {
    const seg = list(["Fjällräven", "Vans", "fjallraven", "Obey", "Converse", "Levis"], "S");
    const qloo: QlooCaller = {
      async call(tool, args) {
        if (tool === "qloo_where_popular") return call(cityHeat);
        if (tool === "qloo_audience_demographics") return call({ operation: "audience_demographics", status: "ok", results: [{ entity_id: "ART", query: { age: { "25_to_29": 0.9 } } }] });
        return call(Array.isArray(args.signals) ? seg : list(["Q"], "C"));
      },
    };
    const out = await runSponsorSegments({ artistId: "ART", city: { name: "Mexico City", country: "MX" }, sessionId: "s" }, { qloo, cities: CITIES });
    const all = JSON.stringify(out);
    expect((all.match(/ällräven|jallraven/gi) ?? []).length).toBeGreaterThan(0);
    const bandItems = (out as unknown as { bands: Array<{ items: Array<{ name: string }> }> }).bands.flatMap((b) => b.items.map((i) => i.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")));
    expect(bandItems.filter((n) => n === "fjallraven").length).toBeLessThanOrEqual(1);
    const allFans = (out as unknown as { allFans?: { items: Array<{ name: string }> } }).allFans;
    if (allFans) expect(allFans.items.filter((i) => /fj/i.test(i.name)).length).toBeLessThanOrEqual(1);
  });
});
