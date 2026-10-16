import { describe, expect, it } from "vitest";
import type { City } from "../src/geo/cities.js";
import { runCityPlaybook } from "../src/pipeline/cityPlaybook.js";
import type { QlooCaller } from "../src/qlooCall.js";
import type { GatewayEvent, QlooEnvelope } from "../src/types.js";
import { cityHeat, recs } from "./fixtures/envelopes.js";

const CITIES: City[] = [{ id: "3", name: "Coyoacan", country: "MX", lat: 19.35, lon: -99.162, population: 600_000 }];
const compare: QlooEnvelope = { operation: "compare_audiences", status: "ok", results: { overlap: 0.4 } };

function qloo(route: (t: string, a: Record<string, unknown>) => QlooEnvelope): QlooCaller {
  let n = 0;
  return { async call(tool, args) { n += 1; return { envelope: route(tool, args), cacheKey: `k${n}`, cached: false, stale: false }; } };
}
const happy = (t: string, a: Record<string, unknown>): QlooEnvelope => {
  if (t === "qloo_where_popular") return cityHeat;
  if (t === "qloo_compare_audiences") return compare;
  if (t === "qloo_rank") return recs(["Venue A", "Venue B"], [0.8, 0.6]);
  if (t === "qloo_recommend" && a.target_type === "artist") return recs(["Opener 1", "Opener 2", "Opener 3", "Opener 4"], [0.9, 0.8, 0.7, 0.6]);
  return recs(["X", "Y"], [0.7, 0.5]);
};
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }
const input = { artist: "Test Artist", artistEntityId: "A1", city: { name: "Mexico City", country: "MX" }, sessionId: "s" };
type Cards = Array<{ kind: string; status: string; items: Array<Record<string, unknown>>; warnings: Array<{ kind: string }> }>;
const cardsOf = (events: GatewayEvent[]) => (events.find((e) => e.type === "playbook") as { playbook: { cards: Cards } }).playbook.cards;

describe("runCityPlaybook", () => {
  it("produces all five evidence cards in order", async () => {
    const events = await collect(runCityPlaybook(input, { qloo: qloo(happy), cities: CITIES }));
    expect(cardsOf(events).map((c) => c.kind)).toEqual(["sponsors", "promo_zones", "local_moment", "venue_fit", "co_billing"]);
    expect(events.at(-1)?.type).toBe("done");
  });
  it("co-billing compares only the top 3 candidates and ranks by lift", async () => {
    const seen: string[] = [];
    const events = await collect(runCityPlaybook(input, { qloo: qloo((t, a) => { if (t === "qloo_compare_audiences") seen.push(String((a.group_b as string[])[0])); return happy(t, a); }), cities: CITIES }));
    expect(seen).toEqual(["E0", "E1", "E2"]);
    const co = cardsOf(events).find((c) => c.kind === "co_billing")!;
    expect(co.items[0]!.lift as number).toBeGreaterThanOrEqual(co.items[1]!.lift as number);
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
  it("unknown overlap yields a partial warning per candidate and an empty co_billing card", async () => {
    const events = await collect(runCityPlaybook(input, {
      qloo: qloo((t, a) => (t === "qloo_compare_audiences" ? { operation: "compare_audiences", status: "ok", results: { something_else: 1 } } : happy(t, a))),
      cities: CITIES,
    }));
    const co = cardsOf(events).find((c) => c.kind === "co_billing")!;
    expect(co.status).toBe("empty");
    const ws = (co.warnings as Array<{ kind: string; message?: string }>).filter((w) => w.kind === "partial");
    expect(ws.map((w) => w.message)).toEqual(["overlap unavailable for Opener 1", "overlap unavailable for Opener 2", "overlap unavailable for Opener 3"]);
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
});
