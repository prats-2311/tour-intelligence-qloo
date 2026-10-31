import { describe, expect, it } from "vitest";
import { boardReducer, initialBoard } from "./tourBoardReducer";
import { buildStrategistContext } from "./strategistContext";
import type { GatewayEvent, ScoredCity } from "./types";

const city = (o: Partial<ScoredCity> & { id: string }): ScoredCity => ({
  name: "Madrid", country: "ES", lat: 0, lon: 0, zones: [], warnings: [], verdict: "play",
  fanHeat: { value: 60 } as never, activation: { value: 50 } as never, winnability: { value: 70 } as never, ...o,
} as ScoredCity);
const brief = { artist: "Bad Bunny", regions: ["Spain"], maxStops: 8 };

describe("buildStrategistContext", () => {
  it("includes the artist entity id for a loaded saved board (resolve event in the stored events)", () => {
    const events = [{ type: "resolve", entity: { entityId: "ART1", name: "Bad Bunny" } }] as unknown as GatewayEvent[];
    const s = boardReducer(initialBoard, { type: "load", brief, events, shortlist: null } as never);
    expect(buildStrategistContext(s.artist, s.brief, s.cities).artist).toEqual({ name: "Bad Bunny", entityId: "ART1" });
  });
  it("adds team status and board flags per city only when present", () => {
    const cities = [
      city({ id: "mad", closeCall: true, candidateSource: "major_market", warnings: [{ tool: "t", kind: "partial" }] }),
      city({ id: "bog", name: "Bogota", country: "CO" }),
    ];
    const ctx = buildStrategistContext({ name: "Bad Bunny", entityId: "ART1" }, brief, cities, { mad: "on_hold" });
    expect(ctx.cities![0]).toMatchObject({ id: "mad", teamStatus: "on_hold", closeCall: true, partialData: true, majorMarket: true });
    expect(ctx.cities![1]).not.toHaveProperty("teamStatus");
    expect(ctx.cities![1]).not.toHaveProperty("closeCall");
    expect(ctx.cities![1]).not.toHaveProperty("partialData");
  });
});
