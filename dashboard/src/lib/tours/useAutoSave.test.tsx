// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import * as client from "@/lib/qloo/client";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents, SAMPLE_PLAYBOOK_CITY_IDS } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { OFF, WorkspaceContext } from "@/lib/collab/workspaceContext";
import { OWNER_KEY } from "./api";
import { buildSavedRun } from "./savedRun";
import { boardReducer, initialBoard } from "@/lib/qloo/tourBoardReducer";
import { seedPlaybooks } from "./savedRun";
import { PATCH_DEBOUNCE_MS, TourAutoSave } from "./useAutoSave";
import type { GatewayEvent } from "@/lib/qloo/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let calls: Array<{ url: string; method: string; body: any }>;
let respond: (method: string, url: string) => Response;
function Probe() {
  const { state, run, loadSaved } = useTourBoard();
  const where = useLocation();
  return (<div>
    <span data-testid="status">{state.status}</span><span data-testid="where">{where.pathname}</span><span data-testid="search">{where.search}</span>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: false })}>live</button>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true, sampleSet: "showcase" })}>showcase</button>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>sample</button>
    <button onClick={() => {
      let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
      for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
      const r = buildSavedRun(s, {});
      loadSaved(r, "saved-9");
    }}>open-saved</button>
  </div>);
}
function tree(entry: string, ws: string | null) {
  return <MemoryRouter initialEntries={[entry]}><WorkspaceContext.Provider value={{ ...OFF, enabled: true, ws }}><ToastProvider><TourBoardProvider><TourAutoSave /><Probe /></TourBoardProvider></ToastProvider></WorkspaceContext.Provider></MemoryRouter>;
}
function mount(entry = "/", ws: string | null = null) {
  const r = render(tree(entry, ws));
  return { ...r, setWs: (w: string | null) => r.rerender(tree(entry, w)) };
}
async function* fakeStream(): AsyncGenerator<GatewayEvent> { for (const e of LUMEN_VALE_SAMPLE) yield e; }
const posts = () => calls.filter((c) => c.method === "POST" && c.url === "/api/tours");
const patches = () => calls.filter((c) => c.method === "PATCH");

beforeEach(() => {
  localStorage.clear(); localStorage.setItem(OWNER_KEY, "tok");
  calls = [];
  respond = (method) => (method === "POST" ? json({ id: "t-1", updatedAt: "u" }, 201) : json({ id: "t-1", updatedAt: "u2" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => { calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body as string) : undefined }); return respond(init.method ?? "GET", url); }));
  const real = client.streamTourBoard;
  vi.spyOn(client, "streamTourBoard").mockImplementation((b, o) => (o?.sample ? real(b, { ...o, delayMs: 0 }) : fakeStream()));
});
afterEach(() => { cleanup(); resetPlaybooks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("auto-save of a live run", () => {
  it("adds saved=<id> to the URL (replace, other params kept) once the run is saved, so a reload reopens it", async () => {
    mount("/tours/playbook/5746545?ws=w1");
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(screen.getByTestId("search").textContent).toContain("saved=t-1"));
    expect(screen.getByTestId("search").textContent).toContain("ws=w1");
    expect(screen.getByTestId("where").textContent).toBe("/tours/playbook/5746545");
  });

  it("posts once as a draft when a live run completes, and toasts with an Open My tours action", async () => {
    mount();
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    const body = posts()[0]!.body;
    expect(body.status).toBe("draft");
    expect(body.summary.artist).toBe("Lumen Vale");
    expect(body.summary.cities.length).toBe(10);
    expect(body.run.v).toBe(1);
    expect(body.run.boardEvents.length).toBeGreaterThan(10);
    expect(body.title).toMatch(/Lumen Vale/);
    expect((await screen.findByText("Saved to My tours")).closest("[role=status]")).toBeTruthy();
    act(() => screen.getByRole("button", { name: "Open My tours" }).click());
    expect(screen.getByTestId("where").textContent).toBe("/tours/mine");
  });
  it("re-renders do not post again", async () => {
    mount();
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts().length).toBe(1);
  });
  it("a second live run is a new tour", async () => {
    mount();
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(2));
  });
  it("never saves the example (showcase) or the sample", async () => {
    mount();
    act(() => screen.getByText("showcase").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    act(() => screen.getByText("sample").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.length).toBe(0);
  });
  it("a tour opened from My tours is already saved: no post", async () => {
    mount();
    act(() => screen.getByText("open-saved").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    await new Promise((r) => setTimeout(r, 50));
    expect(posts().length).toBe(0);
  });
  it("shows the limit message on 409 and does not retry", async () => {
    respond = () => json({ error: "limit" }, 409);
    mount();
    act(() => screen.getByText("live").click());
    expect(await screen.findByText("You have 50 saved tours; delete one to save more.")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(posts().length).toBe(1);
  });
  it("is silent when the browser keeps no site data (feature disabled)", async () => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    mount();
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.length).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("later changes in the same session patch", () => {
  it("a playbook loading after the save is patched in (debounced), not posted", async () => {
    mount();
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    vi.useFakeTimers();
    const id = SAMPLE_PLAYBOOK_CITY_IDS[0];
    let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
    act(() => seedPlaybooks("sample-lumen-vale", s.cities, { [id]: samplePlaybookEvents(id)! }));
    expect(patches().length).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(PATCH_DEBOUNCE_MS + 50); });
    expect(patches().length).toBe(1);
    expect(patches()[0]!.url).toBe("/api/tours/t-1");
    expect(Object.keys(patches()[0]!.body.run.playbooks)).toEqual([id]);
    expect(posts().length).toBe(1);
  });
});

describe("the team workspace rides along with the saved tour", () => {
  const WS = "ws_abcdefghij";
  it("a workspace already attached is in the first save", async () => {
    mount("/", WS);
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]!.body.run.ws).toBe(WS);
  });
  it("a workspace attached after the save is patched in once", async () => {
    const m = mount("/");
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]!.body.run.ws).toBeUndefined();
    vi.useFakeTimers();
    act(() => m.setWs(WS));
    await act(async () => { await vi.advanceTimersByTimeAsync(PATCH_DEBOUNCE_MS + 50); });
    expect(patches().length).toBe(1);
    expect(patches()[0]!.body.run.ws).toBe(WS);
    await act(async () => { await vi.advanceTimersByTimeAsync(PATCH_DEBOUNCE_MS + 50); });
    expect(patches().length).toBe(1);
  });
  it("an invalid workspace id is never stored", async () => {
    mount("/", "nope");
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]!.body.run.ws).toBeUndefined();
  });
});
