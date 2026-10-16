// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF } from "../lib/qloo/fixtures/lumenVale";
import { resetPlaybooks } from "../lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "../lib/qloo/TourBoardProvider";
import { QlooWebMcpTools } from "./QlooWebMcpTools";

type Tool = { name: string; execute: (input: unknown) => Promise<{ content: { text: string }[] }> };
const tools = new Map<string, Tool>();
let abortSignals: AbortSignal[] = [];

function Runner() {
  const { run, state } = useTourBoard();
  useEffect(() => { run(SAMPLE_BRIEF, { sample: true }); }, [run]);
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
        {ui}
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
  (document as unknown as { modelContext?: unknown }).modelContext = {
    registerTool: vi.fn((tool: Tool, opts?: { signal?: AbortSignal }) => { tools.set(tool.name, tool); if (opts?.signal) abortSignals.push(opts.signal); }),
  };
});
afterEach(() => { delete (document as { modelContext?: unknown }).modelContext; resetPlaybooks(); vi.restoreAllMocks(); });

describe("QlooWebMcpTools", () => {
  it("registers the six tour tools when modelContext exists", async () => {
    renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    await waitFor(() => expect([...tools.keys()].sort()).toEqual(["build_tour_from_shortlist", "get_city_playbook", "get_tour_board", "open_city", "open_tour_book", "set_comparison_mode"]));
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
  it("aborts the registration on unmount", async () => {
    const { unmount } = renderWithProviders(<QlooWebMcpTools />, "/tours/board?sample=1");
    await waitFor(() => expect(tools.size).toBe(6));
    unmount();
    expect(abortSignals.every((s) => s.aborted)).toBe(true);
  });
});
