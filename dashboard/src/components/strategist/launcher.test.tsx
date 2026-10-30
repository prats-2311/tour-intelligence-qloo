// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import * as client from "@/lib/qloo/client";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";

const panelProps = vi.hoisted(() => ({ last: undefined as undefined | { sample: boolean } }));
vi.mock("./StrategistPanel", () => ({ StrategistPanel: (p: { sample: boolean; title: string }) => { panelProps.last = p; return <div>{p.title}</div>; } }));

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
const shell = (path: string) => render(<MemoryRouter initialEntries={[path]}><TourBoardProvider sampleDelayMs={0}><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("StrategistLauncher", () => {
  it("shows the FAB on tour routes on phones and opens a full-height strategist sheet", async () => {
    mm(false);
    shell("/tours/board?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(screen.getByRole("dialog", { name: "Ask about this tour" })).toBeTruthy();
  });
  it("docks the FAB inside the sticky footer on board and playbook (so it never covers scores), lifts it above the Book footer, and leaves it low elsewhere", async () => {
    mm(false);
    for (const [path, want] of [["/tours/board?sample=1", "bottom-[calc(4.5rem"], ["/tours/playbook/4005539?sample=1", "bottom-[calc(4.5rem"], ["/tours/book?sample=1", "bottom-[calc(9.5rem"], ["/insights", "bottom-[calc(5rem"], ["/tours/board?sample=1&mode=without", "bottom-[calc(5rem"]] as const) {
      const { unmount } = shell(path);
      const fab = await screen.findByRole("button", { name: "Ask about this tour" });
      expect(fab.className.includes(want), `${path} ${fab.className}`).toBe(true);
      unmount();
    }
  });
  it("titles the panel after the playbook city", async () => {
    mm(false);
    shell("/tours/playbook/4005539?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(await screen.findByText("About Guadalajara")).toBeTruthy();
  });
  it("shows the launcher on insights and titles it generically without a run", async () => {
    mm(false);
    shell("/insights");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(await screen.findByText("Ask about a tour")).toBeTruthy();
  });
  it("an idle showcase panel invites a tap on a recorded question; live keeps the generic wording", async () => {
    mm(false);
    const { unmount } = shell("/tours/board?showcase=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(await screen.findByText("Tap a recorded question to replay how the agent answered it.")).toBeTruthy();
    unmount();
    vi.spyOn(client, "isSampleMode").mockReturnValue(false);
    shell("/insights");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(await screen.findByText("Ask about a tour")).toBeTruthy();
  });
  it("does not show the launcher on a non-product route", () => {
    mm(false);
    shell("/nowhere");
    expect(screen.queryByRole("button", { name: "Ask about this tour" })).toBeNull();
  });
  it("desktop docks the panel, pushes the main area and remembers it open", async () => {
    mm(true);
    shell("/tours/board?sample=1");
    // Desktop has the top-bar toggle (aria-pressed), never the phone FAB.
    expect(await screen.findAllByRole("button", { name: "Ask about this tour" })).toHaveLength(1);
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour", pressed: false }));
    expect(screen.getByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
    expect(localStorage.getItem("strategistOpen")).toBe("1");
    expect(document.querySelector("main")!.className).toContain("lg:pr-[380px]");
  });
  it("desktop restores the open state from localStorage", async () => {
    mm(true);
    localStorage.setItem("strategistOpen", "1");
    shell("/insights");
    expect(await screen.findByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
  });
});

describe("dock dismissal", () => {
  it("Esc closes the desktop dock and returns focus to the launcher", async () => {
    mm(true);
    shell("/tours/board?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour", pressed: false }));
    const dock = screen.getByRole("complementary", { name: "Ask about this tour" });
    const inner = document.createElement("button"); dock.appendChild(inner); inner.focus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ask about this tour", pressed: false })));
    expect(localStorage.getItem("strategistOpen")).toBe("0");
  });
  it("Esc on the page (focus elsewhere) also closes it, but not while another dialog is open", async () => {
    mm(true);
    shell("/tours/board?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour", pressed: false }));
    const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); document.body.appendChild(modal);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
    modal.remove();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull();
  });
  it("closes on a route change instead of following the reader to every page", async () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/tours/board?sample=1"]}><TourBoardProvider sampleDelayMs={0}><AppShell><Link to="/tours/book?sample=1">go</Link></AppShell></TourBoardProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour", pressed: false }));
    expect(screen.getByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "go" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull());
  });
  it("a dock the tour opened survives the route change that brings the tour to its chat step", async () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/tours/board?sample=1"]}><TourBoardProvider sampleDelayMs={0}><AppShell><Link to="/tours/book?sample=1">go</Link></AppShell></TourBoardProvider></MemoryRouter>);
    await screen.findByRole("button", { name: "Ask about this tour", pressed: false });
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    fireEvent.click(screen.getByRole("link", { name: "go" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
  });
});

function Probe() {
  const { run, strategistContext: c, state } = useTourBoard();
  return (
    <>
      <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>run</button>
      <span data-testid="status">{state.status}</span>
      <span data-testid="ctx">{JSON.stringify(c)}</span>
    </>
  );
}

function RunButtons() {
  const { run } = useTourBoard();
  return <><button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>sample-run</button><button onClick={() => run(SAMPLE_BRIEF, { sample: false })}>live-run</button></>;
}
const withRunner = (path: string) => render(<MemoryRouter initialEntries={[path]}><TourBoardProvider sampleDelayMs={0}><RunButtons /><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);

describe("tour:open-ask (the guided tour opens the Ask panel)", () => {
  it("opens the desktop dock", async () => {
    mm(true);
    shell("/tours/board?sample=1");
    expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull();
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    expect(await screen.findByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
  });
  it("tour:close-ask puts the dock back as it was: closed stays closed, open stays open", async () => {
    mm(true);
    const { unmount } = shell("/tours/board?sample=1");
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    expect(await screen.findByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:close-ask")); });
    expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull();
    expect(localStorage.getItem("strategistOpen")).toBe("0");
    unmount();
    localStorage.setItem("strategistOpen", "1");
    shell("/tours/board?sample=1");
    expect(await screen.findByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:close-ask")); });
    expect(screen.getByRole("complementary", { name: "Ask about this tour" })).toBeTruthy();
  });
  it("tour:close-ask closes the phone sheet", async () => {
    mm(false);
    shell("/tours/board?sample=1");
    await screen.findByRole("button", { name: "Ask about this tour" });
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    expect(await screen.findByRole("dialog", { name: "Ask about this tour" })).toBeTruthy();
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:close-ask")); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ask about this tour" })).toBeNull());
  });
  it("opens the phone sheet", async () => {
    mm(false);
    shell("/tours/board?sample=1");
    await screen.findByRole("button", { name: "Ask about this tour" });
    await act(async () => { window.dispatchEvent(new CustomEvent("tour:open-ask")); });
    expect(await screen.findByRole("dialog", { name: "Ask about this tour" })).toBeTruthy();
  });
});

describe("launcher sample flag", () => {
  beforeEach(() => { panelProps.last = undefined; mm(false); });
  it("is true after a sample run, and the title names the artist", async () => {
    withRunner("/tours/board");
    act(() => screen.getByText("sample-run").click());
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    await waitFor(() => expect(screen.getByText("About Lumen Vale")).toBeTruthy());
    expect(panelProps.last!.sample).toBe(true);
  });
  it("is true when idle in a fixtures build", async () => {
    vi.spyOn(client, "isSampleMode").mockReturnValue(true);
    shell("/tours/board");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(panelProps.last!.sample).toBe(true);
  });
  it("is false idle in a live build", async () => {
    vi.spyOn(client, "isSampleMode").mockReturnValue(false);
    shell("/tours/board");
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(panelProps.last!.sample).toBe(false);
  });
  it("is false after a live run", async () => {
    vi.spyOn(client, "isSampleMode").mockReturnValue(true);
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { /* no events */ });
    withRunner("/tours/board");
    act(() => screen.getByText("live-run").click());
    fireEvent.click(await screen.findByRole("button", { name: "Ask about this tour" }));
    expect(panelProps.last!.sample).toBe(false);
  });
  it("survives localStorage.getItem throwing", async () => {
    mm(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    shell("/insights");
    expect(await screen.findByRole("button", { name: "Ask about this tour" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Ask about this tour" })).toBeNull();
  });
});

describe("strategistContext", () => {
  it("carries the board's cities with scores", async () => {
    render(<TourBoardProvider sampleDelayMs={0}><Probe /></TourBoardProvider>);
    expect(JSON.parse(screen.getByTestId("ctx").textContent!)).toEqual({});
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    const c = JSON.parse(screen.getByTestId("ctx").textContent!);
    expect(c.artist.name).toBe("Lumen Vale");
    expect(c.regions).toEqual(SAMPLE_BRIEF.regions);
    const g = c.cities.find((x: { id: string }) => x.id === "4005539");
    expect(g).toMatchObject({ name: "Guadalajara", country: "MX", verdict: "hidden_goldmine", fanHeat: 62 });
    expect(typeof g.activation).toBe("number");
    expect(c.cities.length).toBeLessThanOrEqual(20);
  });
});
