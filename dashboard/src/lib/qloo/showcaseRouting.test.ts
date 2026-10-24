import { afterEach, describe, expect, it } from "vitest";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import {
  cleanEvents, parseShowcase, SHOWCASE, setShowcase, setShowcaseVariant, showcaseBoardEvents, showcaseBrief, showcaseCities, showcasePlaybookEvents,
  showcaseRoutingAvailable, showcaseThisWeek, showcaseWithoutQloo,
} from "./showcase";

afterEach(() => { setShowcaseVariant("main"); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); });

const routing = {
  cities: [{ name: "Alpha", country: "MX" }, { name: "Beta" }],
  boardEvents: [{ type: "resolve", entity: { entityId: "00000000-1", name: "X" } }, { type: "routing_unmatched", names: ["Gamma"] }, { type: "mystery" }, { type: "done", summary: {} }],
  playbooks: { r1: [{ type: "done", summary: {} }, { type: "nope" }] },
};
const base = { recordedAt: "2026-10-20T00:00:00Z", artist: "A", brief: { artist: "A", regions: ["Mexico"], maxStops: 6 }, boardEvents: [{ type: "done", summary: {} }], playbooks: {}, thisWeek: {} };

describe("parseShowcase routing", () => {
  it("accepts the optional routing key and cleans its events", () => {
    const s = parseShowcase({ ...base, routing });
    expect(s.routing?.cities).toEqual(routing.cities);
    expect(s.routing?.boardEvents.map((e) => e.type)).toEqual(["resolve", "routing_unmatched", "done"]);
    expect(s.routing?.playbooks.r1).toEqual([{ type: "done", summary: {} }]);
  });
  it("playbooks are optional in routing", () => {
    expect(parseShowcase({ ...base, routing: { cities: routing.cities, boardEvents: routing.boardEvents } }).routing?.playbooks).toEqual({});
  });
  it("without routing, or with a malformed one, there is none", () => {
    expect(parseShowcase(base).routing).toBeNull();
    expect(parseShowcase({ ...base, routing: "x" }).routing).toBeNull();
    expect(parseShowcase({ ...base, routing: { cities: [], boardEvents: routing.boardEvents } }).routing).toBeNull();
    expect(parseShowcase({ ...base, routing: { cities: routing.cities, boardEvents: [] } }).routing).toBeNull();
    expect(parseShowcase({ ...base, routing: { cities: [{ name: 3 }], boardEvents: routing.boardEvents } }).routing).toBeNull();
  });
  it("the synthetic routing has its own coherent tool-call log and one floor value", () => {
    const r = parseShowcase(syntheticShowcase).routing!;
    const names = new Set(r.cities.map((c) => `${c.name}, ${c.country}`));
    const countries = new Set(["United States", "Brazil"]);
    const places = r.boardEvents.flatMap((e) => (e.type === "tool_call" ? [String(e.args.signal_location ?? e.args.filter_location ?? e.args.within ?? "")] : [])).filter(Boolean);
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((p) => names.has(p) || countries.has(p))).toBe(true);
    expect(places).not.toContain("Mexico");
    expect(r.boardEvents.filter((e) => e.type === "tool_call").length).toBe(r.boardEvents.filter((e) => e.type === "tool_result").length);
    const floored = r.boardEvents.flatMap((e) => (e.type === "city_scored" && e.city.fanHeatFloor ? [e.city] : []));
    expect(floored.length).toBe(2);
    expect(new Set(floored.map((c) => c.fanHeat.value)).size).toBe(1);
    expect(floored[0]!.fanHeat.refs).toEqual([]);
    const others = r.boardEvents.flatMap((e) => (e.type === "city_scored" && !e.city.fanHeatFloor && typeof e.city.fanHeat.value === "number" ? [e.city.fanHeat.value] : []));
    expect(floored[0]!.fanHeat.value).toBe(Math.min(...others));
  });
  it("routing_unmatched is a known event", () => {
    expect(cleanEvents([{ type: "routing_unmatched", names: ["A"] }])).toHaveLength(1);
  });
  it("the committed synthetic recording carries a routing section", () => {
    const s = parseShowcase(syntheticShowcase);
    expect(s.routing).not.toBeNull();
    expect(s.routing!.cities.length).toBeGreaterThanOrEqual(5);
    expect(s.routing!.boardEvents.some((e) => e.type === "routing_unmatched")).toBe(true);
    expect(Object.keys(s.routing!.playbooks)).toHaveLength(2);
  });
});

describe("showcase variant", () => {
  it("routing is unavailable on the placeholder and for a recording without it", () => {
    expect(showcaseRoutingAvailable()).toBe(false);
    setShowcase(parseShowcase(base));
    expect(showcaseRoutingAvailable()).toBe(false);
    setShowcaseVariant("routing"); // falls back to the main recording
    expect(showcaseBoardEvents()).toEqual(SHOWCASE.boardEvents);
  });
  it("the routing variant swaps board, playbooks, brief and cities; main restores them; no web context or generic ranking is claimed", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const main = { board: showcaseBoardEvents(), brief: showcaseBrief(), cities: showcaseCities() };
    expect(showcaseRoutingAvailable()).toBe(true);
    setShowcaseVariant("routing");
    expect(showcaseBoardEvents()).toBe(SHOWCASE.routing!.boardEvents);
    expect(showcaseBrief().cities).toEqual(SHOWCASE.routing!.cities);
    expect(showcaseBrief().artist).toBe(SHOWCASE.artist);
    expect(showcaseCities().every((c) => c.candidateSource === "your_routing")).toBe(true);
    const id = Object.keys(SHOWCASE.routing!.playbooks)[0]!;
    expect(showcasePlaybookEvents(id)).toBe(SHOWCASE.routing!.playbooks[id]);
    expect(showcasePlaybookEvents("not-a-city")).toBeNull();
    expect(showcaseThisWeek(id)).toBeNull();
    expect(showcaseWithoutQloo().status).toBe("unavailable");
    setShowcaseVariant("main");
    expect(showcaseBoardEvents()).toBe(main.board);
    expect(showcaseBrief()).toBe(main.brief);
    expect(showcaseCities()).toEqual(main.cities);
    expect(showcaseBrief().cities).toBeUndefined();
  });
});
