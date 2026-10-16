// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";

vi.mock("@/lib/campaignContext", () => ({ useCampaignContext: () => ({ campaigns: [], activeCampaignId: "x", activeCampaign: undefined, setActiveCampaignId() {}, refresh() {} }) }));

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));
const shell = (path: string) => render(<MemoryRouter initialEntries={[path]}><TourBoardProvider sampleDelayMs={0}><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("StrategistLauncher", () => {
  it("shows the FAB on tour routes on phones and opens a full-height strategist sheet", async () => {
    mm(false);
    shell("/tours/board?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the strategist" }));
    expect(screen.getByRole("dialog", { name: "Ask the strategist" })).toBeTruthy();
  });
  it("titles the panel after the playbook city", async () => {
    mm(false);
    shell("/tours/playbook/4005539?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the strategist" }));
    expect(await screen.findByText("About Guadalajara")).toBeTruthy();
  });
  it("shows the launcher on insights and titles it generically without a run", async () => {
    mm(false);
    shell("/insights");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the strategist" }));
    expect(await screen.findByText("Ask about a tour")).toBeTruthy();
  });
  it("does not show the launcher on legacy campaign routes", () => {
    mm(false);
    shell("/campaign");
    expect(screen.queryByRole("button", { name: "Ask the strategist" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Strategist" })).toBeNull();
  });
  it("desktop docks the panel, pushes the main area and remembers it open", async () => {
    mm(true);
    shell("/tours/board?sample=1");
    expect(screen.queryByRole("button", { name: "Ask the strategist" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Strategist" }));
    expect(screen.getByRole("complementary", { name: "Ask the strategist" })).toBeTruthy();
    expect(localStorage.getItem("strategistOpen")).toBe("1");
    expect(document.querySelector("main")!.className).toContain("lg:pr-[380px]");
  });
  it("desktop restores the open state from localStorage", async () => {
    mm(true);
    localStorage.setItem("strategistOpen", "1");
    shell("/insights");
    expect(await screen.findByRole("complementary", { name: "Ask the strategist" })).toBeTruthy();
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
