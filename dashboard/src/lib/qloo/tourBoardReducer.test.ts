import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_DISPLAY } from "./labels";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "./fixtures/lumenVale";
import { boardReducer, initialBoard } from "./tourBoardReducer";
import type { GatewayEvent } from "./types";

const run = (events: GatewayEvent[]) =>
  events.reduce((s, event) => boardReducer(s, { type: "event", event }), boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "sample" }));

describe("boardReducer", () => {
  it("accumulates a full sample run", () => {
    const s = run(LUMEN_VALE_SAMPLE);
    expect(s.status).toBe("done");
    expect(s.source).toBe("sample");
    expect(s.artist?.name).toBe("Lumen Vale");
    expect(s.cities).toHaveLength(10);
    expect(s.profile?.tags[0]?.name).toBe("dream pop");
    expect(s.log.length).toBe(LUMEN_VALE_SAMPLE.length);
  });
  it("start resets previous results", () => {
    const s = boardReducer(run(LUMEN_VALE_SAMPLE), { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(s).toMatchObject({ status: "streaming", source: "live", cities: [], log: [] });
  });
  it("needs_input pauses with candidates (accents preserved — Review Focus 2)", () => {
    const s = run([{ type: "needs_input", field: "entity", summary: "Choose", candidates: [{ id: "1", name: "Beyoncé" }] }]);
    expect(s.status).toBe("needs_input");
    expect(s.needsInput?.candidates[0]?.name).toBe("Beyoncé");
  });
  it("records empty and unavailable regions separately", () => {
    const s = run([{ type: "region_empty", region: "Atlantis" }, { type: "region_unavailable", region: "Brazil", code: "QLOO_AUTH", message: "x" }]);
    expect(s.regionsEmpty).toEqual(["Atlantis"]);
    expect(s.regionsUnavailable[0]).toMatchObject({ region: "Brazil", code: "QLOO_AUTH" });
  });
  it("error keeps already-scored cities (budget stop)", () => {
    const city = (LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored") as Extract<GatewayEvent, { type: "city_scored" }>);
    const s = run([city, { type: "error", code: "BUDGET", message: "Session limit reached — try the showcase tour." }]);
    expect(s.status).toBe("error");
    expect(s.cities).toHaveLength(1);
    expect(s.error?.code).toBe("BUDGET");
  });
  it("interrupted only applies while streaming (Review Focus 1)", () => {
    const streaming = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(boardReducer(streaming, { type: "interrupted" }).status).toBe("interrupted");
    expect(boardReducer(run(LUMEN_VALE_SAMPLE), { type: "interrupted" }).status).toBe("done");
  });
  it("interrupted records why: user stop vs connection loss", () => {
    const streaming = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(boardReducer(streaming, { type: "interrupted", reason: "user" }).interruptReason).toBe("user");
    expect(boardReducer(streaming, { type: "interrupted" }).interruptReason).toBe("connection");
    expect(boardReducer(boardReducer(streaming, { type: "interrupted", reason: "user" }), { type: "start", brief: SAMPLE_BRIEF, source: "live" }).interruptReason).toBeUndefined();
  });
  it("de-duplicates a re-sent city by id", () => {
    const c = LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored")!;
    expect(run([c, c]).cities).toHaveLength(1);
  });
  it("stores an explicit shortlist and clears it when a new run starts", () => {
    let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "sample" });
    s = boardReducer(s, { type: "shortlist", ids: ["4005539"] });
    expect(s.shortlist).toEqual(["4005539"]);
    s = boardReducer(s, { type: "start", brief: SAMPLE_BRIEF, source: "sample" });
    expect(s.shortlist).toBeNull();
  });
  it("keeps cities in arrival order, never sorted, and a re-scored city keeps its slot", () => {
    const [a, b, c] = LUMEN_VALE_SAMPLE.filter((e) => e.type === "city_scored").slice(0, 3) as Array<Extract<GatewayEvent, { type: "city_scored" }>>;
    const s = run([c!, a!, b!, { ...a!, city: { ...a!.city, name: "Renamed" } }]);
    expect(s.cities.map((x) => x.id)).toEqual([c!.city.id, a!.city.id, b!.city.id]);
    expect(s.cities[1]!.name).toBe("Renamed");
  });
  it("start records the sample set", () => {
    expect(boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "sample", sampleSet: "long" }).sampleSet).toBe("long");
    expect(boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" }).sampleSet).toBeUndefined();
  });
});

describe("boardReducer scoring", () => {
  it("stores the scoring config from the stream and clears it on a new run", () => {
    const scoring = { ...DEFAULT_SCORING_DISPLAY, version: "calibrated-x" };
    let s = run([{ type: "scoring", scoring }]);
    expect(s.scoring).toEqual(scoring);
    s = boardReducer(s, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    expect(s.scoring).toBeNull();
    expect(boardReducer(run([{ type: "scoring", scoring }]), { type: "reset" }).scoring).toBeNull();
  });
});
