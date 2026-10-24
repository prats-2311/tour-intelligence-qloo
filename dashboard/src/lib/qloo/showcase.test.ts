import { describe, expect, it, vi } from "vitest";
import { fetchThisWeek, fetchWithoutQloo, SHOWCASE_STRATEGIST_NOTE, streamCityPlaybook, streamStrategist, streamTourBoard } from "./client";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { recordedText, SAMPLE_TEXT } from "./labels";
import { cleanEvents, parseShowcase, proofFor, rankShiftLine, SHOWCASE, showcaseBannerText } from "./showcase";
import type { GatewayEvent, ScoredCity } from "./types";


const collect = async (g: AsyncGenerator<GatewayEvent>) => { const out: GatewayEvent[] = []; for await (const e of g) out.push(e); return out; };
const c = (id: string, fan: number, win: number | null): ScoredCity => ({
  ...SAMPLE_CITIES[0]!, id, name: `City ${id}`,
  fanHeat: { value: fan, refs: [] },
  winnability: win === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: win, refs: [] },
});

describe("recorded generic ranking", () => {
  const ok = { status: "ok", ranked: [{ name: "X", country: "MX" }], model: "m", cached: false };
  it("keeps a valid withoutQloo", () => {
    expect(parseShowcase({ withoutQloo: ok }).withoutQloo).toEqual(ok);
  });
  it("turns a malformed or missing withoutQloo into null", () => {
    expect(parseShowcase({ withoutQloo: { status: "ok", ranked: "x" } }).withoutQloo).toBeNull();
    expect(parseShowcase({}).withoutQloo).toBeNull();
  });
  it("fetchWithoutQloo in showcase mode never hits the network", async () => {
    const fetchImpl = vi.fn();
    const r = await fetchWithoutQloo({ artist: "A", regions: [], cities: [] }, { sample: true, sampleSet: "showcase", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.status).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("showcase data", () => {
  it("the committed placeholder is the Lumen Vale sample and is labelled as such", () => {
    expect(SHOWCASE.recordedAt).toBeNull();
    expect(SHOWCASE.boardEvents.filter((e) => e.type === "city_scored")).toHaveLength(SAMPLE_CITIES.length);
    expect(showcaseBannerText()).toBe(SAMPLE_TEXT);
  });
  it("a recorded run is labelled with its ISO date and 'not live'", () => {
    expect(recordedText("2026-10-16T10:00:00.000Z")).toBe("Recorded Qloo run · 2026-10-16 — not live");
  });
  it("keeps the scoring event so a recorded run replays its calibrated config", () => {
    const scoring = { type: "scoring", scoring: { version: "v", thresholds: {} } };
    expect(cleanEvents([scoring])).toEqual([scoring]);
  });
  it("keeps closeCallBand on a scoring event, and an older recording without it still parses", () => {
    const withBand = { type: "scoring", scoring: { version: "v", thresholds: {} }, closeCallBand: 3 };
    expect(cleanEvents([withBand])).toEqual([withBand]);
    expect(cleanEvents([{ type: "scoring", scoring: { version: "v", thresholds: {} } }])).toHaveLength(1);
  });
  it("drops a scoring event without a thresholds object", () => {
    expect(cleanEvents([{ type: "scoring" }, { type: "scoring", scoring: {} }, { type: "scoring", scoring: { thresholds: 3 } }])).toEqual([]);
  });
  it("skips unknown event types and malformed entries instead of crashing", () => {
    const events = cleanEvents([{ type: "done", summary: {} }, { type: "from_the_future", x: 1 }, null, "x", { nope: 1 }]);
    expect(events).toEqual([{ type: "done", summary: {} }]);
    const parsed = parseShowcase({ recordedAt: "2026-10-16T00:00:00Z", artist: "A", boardEvents: [{ type: "mystery" }, { type: "done", summary: {} }], playbooks: { "1": [{ type: "mystery" }] } });
    expect(parsed.boardEvents).toHaveLength(1);
    expect(parsed.playbooks["1"]).toEqual([]);
  });
});

describe("showcase replay", () => {
  it("replays the board, playbook and this-week with zero fetches", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const board = await collect(streamTourBoard(SAMPLE_BRIEF, { sample: true, sampleSet: "showcase", delayMs: 0 }));
      expect(board).toEqual(SHOWCASE.boardEvents);
      expect(board.length).toBe(LUMEN_VALE_SAMPLE.length);
      const id = Object.keys(SHOWCASE.playbooks)[0]!;
      const pb = await collect(streamCityPlaybook({ artist: "a", artistEntityId: "e", city: "x", country: "y" }, { sample: true, sampleSet: "showcase", cityId: id, delayMs: 0 }));
      expect(pb).toEqual(SHOWCASE.playbooks[id]);
      const week = await fetchThisWeek({ city: "x", country: "y" }, { sample: true, sampleSet: "showcase", cityId: id });
      expect(week).toEqual(SHOWCASE.thisWeek[id]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("an unrecorded city gets an honest NO_SAMPLE error and no web context", async () => {
    const pb = await collect(streamCityPlaybook({ artist: "a", artistEntityId: "e", city: "Nowhere", country: "y" }, { sample: true, sampleSet: "showcase", cityId: "nope", delayMs: 0 }));
    expect(pb).toEqual([{ type: "error", code: "NO_SAMPLE", message: "No recorded playbook for Nowhere" }]);
    expect((await fetchThisWeek({ city: "x", country: "y" }, { sample: true, sampleSet: "showcase", cityId: "nope" })).status).toBe("unavailable");
  });
  it("the strategist answers every question with the honest note, never a script", async () => {
    const ev = await collect(streamStrategist({ messages: [{ role: "user", text: "Why is Guadalajara a hidden goldmine?" }], context: {} }, { sample: true, sampleSet: "showcase", delayMs: 0 }));
    expect(ev[0]).toEqual({ type: "strategist_error", code: "UNAVAILABLE", message: SHOWCASE_STRATEGIST_NOTE });
    expect(SHOWCASE_STRATEGIST_NOTE).toBe("The live strategist needs a live run");
  });
  it("Without Qloo has no recorded answer and says so", async () => {
    const r = await fetchWithoutQloo({ artist: "a", regions: [], cities: [] }, { sample: true, sampleSet: "showcase" });
    expect(r.status).toBe("unavailable");
  });
});

describe("proofFor", () => {
  it("picks the city with the biggest density to winnability climb and states both ranks", () => {
    // density order: a(90) b(80) c(70) d(60); winnability order: d(95) a(60) b(50) c(40)
    const p = proofFor([c("a", 90, 60), c("b", 80, 50), c("c", 70, 40), c("d", 60, 95)])!;
    expect(p.city.id).toBe("d");
    expect(p.line).toBe("Fan density ranks it 4th of 4. Adding winnability puts it 1st.");
  });
  it("rankShiftLine says keeps when the ranks match, and never says better", () => {
    expect(rankShiftLine(3, 3, 8)).toBe("Fan density ranks it 3rd of 8. Adding winnability keeps it 3rd.");
    expect(rankShiftLine(6, 3, 10)).toBe("Fan density ranks it 6th of 10. Adding winnability puts it 3rd.");
    expect(rankShiftLine(6, 3, 10)).not.toMatch(/better|beat|outperform|smarter|goldmine/i);
  });
  it("makes no shift claim when no city climbs", () => {
    const p = proofFor([c("a", 90, 95), c("b", 80, 50), c("c", 70, 40)])!;
    expect(p.city.id).toBe("a");
    expect(p.line).toBe("Ranked 1st of 3 scored markets on winnability.");
    expect(p.line).not.toMatch(/density/);
  });
  it("ignores cities without a score and returns null when nothing is scored", () => {
    expect(proofFor([c("a", 90, null)])).toBeNull();
    expect(proofFor([])).toBeNull();
    expect(proofFor([c("a", 90, null), c("b", 50, 50)])!.line).toBe("Ranked 1st of 1 scored market on winnability.");
  });
  it("only offers cities that have a recorded playbook, ranked against the whole board", () => {
    const all = [c("a", 90, 60), c("b", 80, 50), c("c", 70, 40), c("d", 60, 95)];
    const p = proofFor(all, ["a", "b"])!;
    expect(p.city.id).not.toBe("d");
    expect(p.line).toBe("Ranked 1st of 4 scored markets on winnability.".replace("1st", "2nd"));
    expect(proofFor(all, ["zzz"])).toBeNull();
  });
  it("ties never count as a climb", () => {
    // b ties a on fan heat and wins on name; its density rank is shared 1st, so no climb is claimed for b
    const p = proofFor([c("a", 90, 80), c("b", 90, 50)])!;
    expect(p.line).toBe("Ranked 1st of 2 scored markets on winnability.");
    const q = proofFor([c("a", 90, 50), c("b", 90, 50)])!;
    expect(q.line).toMatch(/^Ranked 1st of 2/);
  });
});
