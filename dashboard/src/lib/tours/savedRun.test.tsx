// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents, SAMPLE_PLAYBOOK_CITY_IDS } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { loadPlaybook, getPlaybook, playbookKey, resetPlaybooks } from "@/lib/qloo/playbookStore";
import { boardReducer, initialBoard, type BoardState } from "@/lib/qloo/tourBoardReducer";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { buildSavedRun, parseSavedRun, summaryOf, exportPlaybooks, seedPlaybooks, type SavedRun } from "./savedRun";

function board(): BoardState {
  let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
  for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
  return s;
}
afterEach(() => { resetPlaybooks(); vi.unstubAllGlobals(); });

describe("saved run format (same shape as a recording)", () => {
  it("carries brief, the board events and the shortlist; parses back", () => {
    const state = board();
    const run = buildSavedRun(state, {});
    expect(run.v).toBe(1);
    expect(run.brief).toEqual(SAMPLE_BRIEF);
    expect(run.boardEvents.length).toBe(state.log.length);
    expect(parseSavedRun(JSON.parse(JSON.stringify(run)))?.boardEvents.length).toBe(state.log.length);
  });
  it("parse rejects junk and drops unknown event types", () => {
    expect(parseSavedRun(null)).toBeNull();
    expect(parseSavedRun({})).toBeNull();
    expect(parseSavedRun({ v: 1, brief: { artist: "x", regions: [], maxStops: 3 }, boardEvents: [] })).toBeNull();
    const ok = parseSavedRun({ v: 1, brief: SAMPLE_BRIEF, boardEvents: [{ type: "bogus" }, LUMEN_VALE_SAMPLE[0], LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored")], playbooks: {} });
    expect(ok?.boardEvents.length).toBe(2);
  });
  it("summaryOf lists artist, regions and the scored cities with verdict and score", () => {
    const sum = summaryOf(board());
    expect(sum.artist).toBe("Lumen Vale");
    expect(sum.regions).toEqual(SAMPLE_BRIEF.regions);
    expect(sum.cities.length).toBeGreaterThan(2);
    expect(sum.cities[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), country: expect.any(String), verdict: expect.any(String) });
  });
});

describe("summaryOf with unscored cities", () => {
  it("leaves out a null winnability so the gateway never sees score: null", () => {
    const state = board();
    state.cities = state.cities.map((c, i) => (i === 0 ? { ...c, winnability: { value: null, reason: "insufficient_data" as const, refs: [] } } : c));
    const sum = summaryOf(state);
    expect(JSON.parse(JSON.stringify(sum)).cities[0]).not.toHaveProperty("score", null);
    expect(typeof sum.cities[1]!.score).toBe("number");
  });
});

describe("playbooks ride along", () => {
  it("a finished live playbook is exported as events and seeds the store with no request", async () => {
    const id = SAMPLE_PLAYBOOK_CITY_IDS[0];
    const state = board();
    const key = playbookKey(state.artist!.entityId, id, undefined);
    seedPlaybooks(state.artist!.entityId, state.cities, { [id]: samplePlaybookEvents(id)! });
    expect(getPlaybook(key)?.status).toBe("done");
    expect(getPlaybook(key)?.cards.length).toBeGreaterThan(0);
    const out = exportPlaybooks(state.artist!.entityId, state.cities);
    expect(Object.keys(out)).toEqual([id]);
    resetPlaybooks();
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    seedPlaybooks(state.artist!.entityId, state.cities, out);
    const s = await loadPlaybook({ artist: "Lumen Vale", artistEntityId: state.artist!.entityId, city: { id, name: "x", country: "y" }, sample: false });
    expect(s.status).toBe("done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function Probe({ run }: { run: SavedRun }) {
  const { state, loadSaved } = useTourBoard();
  return (<div><span data-testid="status">{state.status}</span><span data-testid="source">{state.source}</span><span data-testid="count">{state.cities.length}</span><span data-testid="artist">{state.brief?.artist}</span>
    <button onClick={() => loadSaved(run)}>load</button></div>);
}
describe("provider.loadSaved", () => {
  it("opens the board finished from a saved run, with no network", () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const state = board();
    const run = buildSavedRun(state, {});
    render(<TourBoardProvider><Probe run={run} /></TourBoardProvider>);
    expect(screen.getByTestId("status").textContent).toBe("idle");
    act(() => screen.getByText("load").click());
    expect(screen.getByTestId("status").textContent).toBe("done");
    expect(screen.getByTestId("source").textContent).toBe("live");
    expect(screen.getByTestId("count").textContent).toBe(String(state.cities.length));
    expect(screen.getByTestId("artist").textContent).toBe("Lumen Vale");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
