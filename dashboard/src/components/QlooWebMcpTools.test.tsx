// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceContext, OFF, type Workspace } from "../lib/collab/workspaceContext";
import { emptySnapshot } from "../lib/collab/types";
import * as client from "../lib/qloo/client";
import * as lumenPlaybooks from "../lib/qloo/fixtures/lumenValePlaybooks";
import { withArielPink } from "../test/arielPink";
import * as segmentStore from "../lib/qloo/segmentStore";
import { SAMPLE_BRIEF } from "../lib/qloo/fixtures/lumenVale";
import { resetPlaybooks } from "../lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "../lib/qloo/TourBoardProvider";
import { QlooWebMcpTools } from "./QlooWebMcpTools";

type Tool = { name: string; execute: (input: unknown) => Promise<{ content: { text: string }[] }> };
const tools = new Map<string, Tool>();
let abortSignals: AbortSignal[] = [];

let runOpts: { sample: boolean; sampleSet?: "showcase" } = { sample: true };
let wsValue: Workspace = OFF;
function Runner() {
  const { run, state } = useTourBoard();
  useEffect(() => { run(SAMPLE_BRIEF, runOpts); }, [run]);
  return <span data-testid="board">{state.status}</span>;
}
function Where() {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}
const currentPath = () => screen.getByTestId("where").textContent!.split("?")[0];
const currentSearch = () => "?" + (screen.getByTestId("where").textContent!.split("?")[1] ?? "");
const out = async (name: string, input: unknown = {}) => JSON.parse((await tools.get(name)!.execute(input)).content[0].text);

function renderWithProviders(ui: React.ReactNode, url: string, opts: { run?: boolean } = {}) {
  return render(
    <TourBoardProvider sampleDelayMs={0}>
      <MemoryRouter initialEntries={[url]}>
        {opts.run && <Runner />}
        <Where />
        <WorkspaceContext.Provider value={wsValue}>{ui}</WorkspaceContext.Provider>
      </MemoryRouter>
    </TourBoardProvider>,
  );
}
const withBoard = async (url: string) => {
  renderWithProviders(<QlooWebMcpTools />, url, { run: true });
  await waitFor(() => expect(screen.getByTestId("board").textContent).toBe("done"));
};

beforeEach(() => {
  tools.clear();
  abortSignals = [];
  runOpts = { sample: true };
  wsValue = OFF;
  (document as unknown as { modelContext?: unknown }).modelContext = {
    registerTool: vi.fn((tool: Tool, opts?: { signal?: AbortSignal }) => { tools.set(tool.name, tool); if (opts?.signal) abortSignals.push(opts.signal); }),
  };
});
afterEach(() => { delete (document as { modelContext?: unknown }).modelContext; resetPlaybooks(); vi.restoreAllMocks(); });

describe("QlooWebMcpTools", () => {
  it("registers the eleven tour tools when modelContext exists", async () => {
    renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    await waitFor(() => expect([...tools.keys()].sort()).toEqual(["add_team_note", "build_tour_from_shortlist", "get_advance_risks", "get_city_playbook", "get_sponsors_by_age", "get_team_notes", "get_tour_board", "open_city", "open_tour_book", "set_city_status", "set_comparison_mode"]));
  });
  it("does nothing without modelContext", () => {
    delete (document as { modelContext?: unknown }).modelContext;
    expect(() => renderWithProviders(<QlooWebMcpTools />, "/")).not.toThrow();
    expect(tools.size).toBe(0);
  });
  it("open_city with an unknown id returns an error and does not navigate", async () => {
    renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    const res = await tools.get("open_city")!.execute({ city_id: "nope" });
    expect(JSON.parse(res.content[0].text)).toEqual({ ok: false, error: "Unknown city" });
    expect(currentPath()).toBe("/tours/board");
  });
  it("open_tour_book before any run returns an error", async () => {
    renderWithProviders(<QlooWebMcpTools />, "/");
    const res = await tools.get("open_tour_book")!.execute({});
    expect(JSON.parse(res.content[0].text)).toEqual({ ok: false, error: "No Tour Board run yet" });
    expect(currentPath()).toBe("/");
  });
  it("set_comparison_mode validates and keeps the sample flag", async () => {
    renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    expect(JSON.parse((await tools.get("set_comparison_mode")!.execute({ mode: "chaos" })).content[0].text).ok).toBe(false);
    expect(currentSearch()).toBe("?sample=1");
    await tools.get("set_comparison_mode")!.execute({ mode: "without" });
    await waitFor(() => expect(currentSearch()).toContain("mode=without"));
    expect(currentSearch()).toContain("sample=1");
  });
  it("get_city_playbook returns top items and claim counts for a sample city", async () => {
    await withBoard("/tours/board?sample=1");
    const res = await out("get_city_playbook", { city_id: "4005539" });
    expect(res).toMatchObject({ ok: true, status: "done", claims: { verified: 7, removed: 2 } });
    const sponsors = res.cards.find((c: { kind: string }) => c.kind === "sponsors");
    expect(sponsors.top).toHaveLength(3);
    expect(sponsors.top[0]).toEqual({ name: "Cerro Alto Mezcal", value: 0.91 });
    expect(await out("get_city_playbook", { city_id: "nope" })).toEqual({ ok: false, error: "Unknown city" });
  });
  it("get_city_playbook never lists a do-not-book act and counts only shown claims", async () => {
    const real = lumenPlaybooks.samplePlaybookEvents;
    vi.spyOn(lumenPlaybooks, "samplePlaybookEvents").mockImplementation((id, o) => { const ev = real(id, o); return ev && withArielPink(ev); });
    await withBoard("/tours/board?sample=1");
    const res = await out("get_city_playbook", { city_id: "4005539" });
    expect(res.claims).toEqual({ verified: 7, removed: 2 });
    expect(JSON.stringify(res)).not.toMatch(/Ariel Pink/);
  });
  it("get_tour_board summarises cities and the shortlist", async () => {
    await withBoard("/tours/board?sample=1");
    const res = await out("get_tour_board");
    expect(res).toMatchObject({ ok: true, source: "sample", status: "done", artist: "Lumen Vale" });
    expect(res.cities).toHaveLength(10);
    expect(res.cities[0]).toHaveProperty("winnability");
    expect(Array.isArray(res.shortlist)).toBe(true);
  });
  it("open_city navigates to the playbook and keeps the sample flag", async () => {
    await withBoard("/tours/board?sample=1");
    expect(await out("open_city", { city_id: "4005539" })).toMatchObject({ ok: true });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/tours/playbook/4005539?sample=1"));
  });
  it("build_tour_from_shortlist keeps only eligible ids and opens the book", async () => {
    await withBoard("/tours/board?sample=1");
    const board = await out("get_tour_board");
    const eligible = board.cities.filter((c: { verdict: string }) => c.verdict === "play" || c.verdict === "hidden_goldmine").map((c: { id: string }) => c.id);
    const skip = board.cities.find((c: { verdict: string }) => c.verdict === "skip" || c.verdict === "consider" || c.verdict === "de_risk");
    const res = await out("build_tour_from_shortlist", { city_ids: [eligible[0], skip.id, "nope"] });
    expect(res).toMatchObject({ ok: true, shortlist: [eligible[0]] });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/tours/book?sample=1"));
    expect((await out("get_tour_board")).shortlist).toEqual([eligible[0]]);
  });
  it("build_tour_from_shortlist with no eligible ids errors and leaves the shortlist and page unchanged", async () => {
    await withBoard("/tours/board?sample=1");
    const before = (await out("get_tour_board")).shortlist;
    const res = await out("build_tour_from_shortlist", { city_ids: ["nope"] });
    expect(res).toEqual({ ok: false, error: "No eligible cities" });
    expect((await out("get_tour_board")).shortlist).toEqual(before);
    expect(screen.getByTestId("where").textContent).toBe("/tours/board?sample=1");
  });
  it("aborts the registration on unmount", async () => {
    const { unmount } = renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    await waitFor(() => expect(tools.size).toBe(11));
    unmount();
    expect(abortSignals.every((s) => s.aborted)).toBe(true);
  });

  it("read-only hints: reads are readOnly, writes are not", async () => {
    const hints = new Map<string, boolean>();
    (document as unknown as { modelContext: { registerTool: unknown } }).modelContext.registerTool = vi.fn((t: Tool & { annotations: { readOnlyHint: boolean } }) => { tools.set(t.name, t); hints.set(t.name, t.annotations.readOnlyHint); });
    renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    await waitFor(() => expect(hints.size).toBe(11));
    for (const n of ["get_sponsors_by_age", "get_advance_risks", "get_team_notes"]) expect(hints.get(n)).toBe(true);
    for (const n of ["add_team_note", "set_city_status"]) expect(hints.get(n)).toBe(false);
  });

  describe("get_sponsors_by_age", () => {
    it("returns compact bands from the segment store and drops non-sponsors", async () => {
      await withBoard("/tours/board?sample=1");
      const load = vi.spyOn(segmentStore, "loadSegments").mockResolvedValue({ status: "done", data: { status: "ok", indexes: {}, bands: [
        { band: "25_to_29", phrase: "", index: 0.91, status: "ok", hiddenCount: 0, newInTop5: 2, lifted: true, items: [{ name: "Kith", entityId: "e1", artistRank: 1, cityRank: 2 }, { name: "Red Cross", entityId: "e2", artistRank: 2, cityRank: null }] },
        { band: "55_and_older", phrase: "", index: 0.3, status: "empty", hiddenCount: 0, newInTop5: null, lifted: false, items: [] },
      ] } });
      const res = await out("get_sponsors_by_age", { city_id: "4005539" });
      expect(res).toEqual({ ok: true, status: "ok", bands: [{ age: "25–29", index: 0.91, brands: ["Kith"] }] });
      expect(load.mock.calls[0][0]).toMatchObject({ artistId: expect.any(String), city: { id: "4005539", name: "Guadalajara" } });
    });
    it("reports unavailable data and unknown cities as errors", async () => {
      await withBoard("/tours/board?sample=1");
      vi.spyOn(segmentStore, "loadSegments").mockResolvedValue({ status: "done", data: { status: "unavailable", message: "Qloo couldn't break this segment out.", indexes: {}, bands: [] } });
      expect(await out("get_sponsors_by_age", { city_id: "4005539" })).toEqual({ ok: false, error: "Qloo couldn't break this segment out." });
      expect(await out("get_sponsors_by_age", { city_id: "nope" })).toEqual({ ok: false, error: "Unknown city" });
    });
  });

  describe("get_advance_risks", () => {
    const advance = { weather: { status: "ok", source: "x", sourceUrl: "u", years: [2025], days: 30, tempMaxC: { mean: 28, min: 20, max: 33 }, tempMinC: { mean: 15 }, rainDaysShare: 0.2, note: "Dry" }, holidays: { status: "ok", source: "x", sourceUrl: "u", items: [{ date: "2027-04-02", name: "Good Friday", localName: "GF", near: true }, { date: "2027-01-01", name: "New Year", localName: "NY", near: false }] }, visa: { status: "ok", summary: "Visa needed", items: [{ text: "Apply early", sourceUrl: "u" }], sources: [], cached: false }, equipment: { status: "unavailable", message: "nope" }, generatedAt: "" } as const;
    it("calls fetchAdvance with the date window and coordinates", async () => {
      runOpts = { sample: true, sampleSet: "showcase" };
      await withBoard("/tours/board?showcase=1");
      const f = vi.spyOn(client, "fetchAdvance").mockResolvedValue(advance as never);
      const id = (await out("get_tour_board")).cities[0].id;
      const res = await out("get_advance_risks", { city_id: id });
      expect(f.mock.calls[0][0]).toMatchObject({ window: SAMPLE_BRIEF.dateWindow, lat: expect.any(Number), lon: expect.any(Number) });
      expect(res).toMatchObject({ ok: true, window: SAMPLE_BRIEF.dateWindow, weather: { highC: 28 }, holidays: [{ date: "2027-04-02", name: "Good Friday" }], visa: { summary: "Visa needed", points: ["Apply early"] }, equipment: { unavailable: "nope" } });
    });
    it("refuses invented sample cities and unknown ids", async () => {
      await withBoard("/tours/board?sample=1");
      const f = vi.spyOn(client, "fetchAdvance");
      expect((await out("get_advance_risks", { city_id: "4005539" })).ok).toBe(false);
      expect(await out("get_advance_risks", { city_id: "nope" })).toEqual({ ok: false, error: "Unknown city" });
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe("team tools", () => {
    const actor = { name: "Sam", role: "Manager" } as const;
    const make = (over: Partial<Workspace> = {}): Workspace => ({ ...OFF, enabled: true, ws: "ws_abcdefghij", ...over });
    const write = vi.fn(async () => true);
    beforeEach(() => { write.mockClear(); });

    it("get_team_notes returns statuses, open threads, resolved count and decisions", async () => {
      const snap = { ...emptySnapshot("ws_abcdefghij"),
        statuses: { "4005539": { status: "on_hold" as const, ...actor, at: 1 } },
        threads: {
          "city:4005539": { resolved: false, messages: [{ id: "m1", ...actor, text: "Check holds", at: 1 }] },
          "card:4005539:sponsors": { resolved: true, messages: [{ id: "m2", ...actor, text: "Done", at: 1 }] },
        },
        overrides: { "4005539": { best_room: { value: "Teatro", original: "Foro", ...actor, at: 1 } } } };
      wsValue = make({ snapshot: snap });
      renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
      const res = await out("get_team_notes");
      expect(res).toEqual({ ok: true, workspace: "ws_abcdefghij",
        statuses: [{ city_id: "4005539", status: "On hold", by: "Sam (Manager)" }],
        openThreads: [{ key: "city:4005539", messages: 1, latest: { by: "Sam (Manager)", text: "Check holds" } }],
        resolvedThreads: 1, decisions: [{ city_id: "4005539", field: "best_room", value: "Teatro", by: "Sam" }] });
    });
    it("get_team_notes with no workspace yet is empty, and with collaboration off is an error", async () => {
      wsValue = make();
      renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
      expect(await out("get_team_notes")).toMatchObject({ ok: true, statuses: [], openThreads: [], resolvedThreads: 0 });
      wsValue = OFF;
      cleanup();
      renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
      expect((await out("get_team_notes")).ok).toBe(false);
    });
    it("add_team_note without an identity asks for one and never writes", async () => {
      wsValue = make({ write, identity: null });
      await withBoard("/tours/board?sample=1");
      const res = await out("add_team_note", { text: "hello", city_id: "4005539" });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Ask the user to set their name and role/);
      expect(write).not.toHaveBeenCalled();
    });
    it("add_team_note posts to the city or card thread as the current identity", async () => {
      wsValue = make({ write, identity: actor });
      await withBoard("/tours/board?sample=1");
      expect(await out("add_team_note", { text: " Hold the 12th ", city_id: "4005539" })).toMatchObject({ ok: true, key: "city:4005539", as: "Sam (Manager)" });
      expect(write).toHaveBeenLastCalledWith("message", { key: "city:4005539", text: "Hold the 12th" });
      await out("add_team_note", { text: "Brands look right", city_id: "4005539", card_kind: "sponsors" });
      expect(write).toHaveBeenLastCalledWith("message", { key: "card:4005539:sponsors", text: "Brands look right" });
    });
    it("add_team_note validates text, city and card kind", async () => {
      wsValue = make({ write, identity: actor });
      await withBoard("/tours/board?sample=1");
      expect((await out("add_team_note", { text: "  ", city_id: "4005539" })).ok).toBe(false);
      expect((await out("add_team_note", { text: "x" })).error).toMatch(/city_id is required/);
      expect((await out("add_team_note", { text: "x", city_id: "nope" })).error).toBe("Unknown city");
      expect((await out("add_team_note", { text: "x", city_id: "4005539", card_kind: "bogus" })).ok).toBe(false);
      expect(write).not.toHaveBeenCalled();
    });
    it("add_team_note defaults to the city whose playbook is open", async () => {
      wsValue = make({ write, identity: actor });
      await withBoard("/tours/playbook/4005539?sample=1");
      expect((await out("add_team_note", { text: "x" })).key).toBe("city:4005539");
    });
    it("set_city_status writes the status key and needs an identity", async () => {
      wsValue = make({ write, identity: null });
      await withBoard("/tours/board?sample=1");
      expect((await out("set_city_status", { city_id: "4005539", status: "Confirmed" })).ok).toBe(false);
      expect(write).not.toHaveBeenCalled();
      cleanup();
      wsValue = make({ write, identity: actor });
      await withBoard("/tours/board?sample=1");
      expect(await out("set_city_status", { city_id: "4005539", status: "On hold" })).toEqual({ ok: true, city_id: "4005539", status: "On hold" });
      expect(write).toHaveBeenCalledWith("status", { cityId: "4005539", status: "on_hold" });
      expect((await out("set_city_status", { city_id: "4005539", status: "Maybe" })).ok).toBe(false);
      expect((await out("set_city_status", { city_id: "nope", status: "Dropped" })).error).toBe("Unknown city");
    });
  });
});
