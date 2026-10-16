import { describe, expect, it } from "vitest";
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
  it("de-duplicates a re-sent city by id", () => {
    const c = LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored")!;
    expect(run([c, c]).cities).toHaveLength(1);
  });
});
