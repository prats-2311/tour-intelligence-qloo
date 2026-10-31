// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourProvider } from "@/components/tour/TourProvider";
import { AppShell } from "@/components/AppShell";
import { OFF, WorkspaceContext, type Workspace } from "@/lib/collab/workspaceContext";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";

let desktop = true;
beforeEach(() => {
  desktop = true;
  localStorage.clear();
  setShowcase(parseShowcase(syntheticShowcase));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("1024") || q.includes("1440") ? desktop : q.includes("max-width") ? !desktop : false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function () { return [{ width: 10, height: 10 }] as unknown as DOMRectList; });
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollBy = vi.fn();
});
afterEach(() => { cleanup(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ON = { ...OFF, enabled: true } as unknown as Workspace;
const mount = (ws: Workspace = OFF, url = "/tours/board?showcase=1") => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[url]}>
      <WorkspaceContext.Provider value={ws}><TourBoardProvider><TourProvider><AppShell><p>child</p></AppShell></TourProvider></TourBoardProvider></WorkspaceContext.Provider>
    </MemoryRouter>
  </QueryClientProvider>,
);
const side = () => within(document.querySelector<HTMLElement>("aside[aria-label='Site sections']")!);

describe("Tours in the sidebar", () => {
  it("lists the tours with minutes; the team tour only while a workspace is on", () => {
    mount();
    const nav = side().getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByText("Tours")).toBeTruthy();
    expect(side().getByRole("button", { name: /^The essentials, 2 min/ })).toBeTruthy();
    expect(side().getByRole("button", { name: /^Plan the tour, 2 min/ })).toBeTruthy();
    expect(side().getByRole("button", { name: /^Trust and agents, 1 min/ })).toBeTruthy();
    expect(side().queryByRole("button", { name: /^Work as a team/ })).toBeNull();
    cleanup();
    mount(ON);
    expect(side().getByRole("button", { name: /^Work as a team, 2 min/ })).toBeTruthy();
  });
  it("a completed tour carries a tick, read from tiq.tour.<id> and tiq.tour.v1", () => {
    localStorage.setItem("tiq.tour.v1", "completed");
    localStorage.setItem("tiq.tour.plan", "dismissed");
    mount();
    expect(side().getByRole("button", { name: "The essentials, 2 min, completed" })).toBeTruthy();
    expect(side().getByRole("button", { name: "Plan the tour, 2 min" })).toBeTruthy();
  });
  it("clicking a tour starts it", async () => {
    mount();
    fireEvent.click(side().getByRole("button", { name: /^Plan the tour/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByTestId("tour-popover")).toBeTruthy();
    expect(screen.getByText("1 of 7")).toBeTruthy();
  });
  it("a tour started from the phone drawer returns focus to the hamburger when it ends", async () => {
    desktop = false;
    mount();
    const burger = screen.getByRole("button", { name: "Open navigation" });
    burger.focus();
    fireEvent.click(burger);
    fireEvent.click(screen.getByRole("button", { name: /^Plan the tour/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByTestId("tour-popover")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(document.activeElement).toBe(burger);
  });
  it("no Tours section without a real recording", () => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
    mount();
    expect(screen.queryByText("Tours")).toBeNull();
  });
  it("the phone drawer lists them too", () => {
    desktop = false;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: /^The essentials, 2 min/ })).toBeTruthy();
  });
});
