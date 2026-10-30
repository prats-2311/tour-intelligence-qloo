// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OFF, WorkspaceContext, type Workspace } from "@/lib/collab/workspaceContext";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { AppShell } from "./AppShell";

let desktop = true;
beforeEach(() => {
  desktop = true;
  localStorage.clear();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("1024") || q.includes("1440") ? desktop : q.includes("max-width") ? !desktop : false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const mount = (url: string, ws: Workspace = OFF, extra?: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <WorkspaceContext.Provider value={ws}><TourBoardProvider><AppShell><p>child</p></AppShell>{extra}</TourBoardProvider></WorkspaceContext.Provider>
    </MemoryRouter>,
  );
const sidebar = () => document.querySelector<HTMLElement>("aside[aria-label='Site sections']");
const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) sidebar/ });

describe("desktop sidebar", () => {
  it("the landing page has the header but no sidebar and no breadcrumbs", () => {
    mount("/");
    expect(screen.getByText("Tour Intelligence")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(sidebar()).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open navigation" })).toBeNull();
  });
  it("from the board onward there is a sidebar next to the unchanged header and stepper", () => {
    mount("/tours/board?showcase=1");
    expect(sidebar()).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(document.querySelector("header [data-step]")).toBeTruthy();
    expect(sidebar()!.closest("header")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });
  it("highlights the active item and keeps the query on its links", () => {
    mount("/tours/board?showcase=1&ws=w1");
    const side = within(sidebar()!);
    expect(side.getByRole("link", { name: "Tour Board" }).getAttribute("aria-current")).toBe("page");
    expect(side.getByRole("link", { name: "Tour Book" }).getAttribute("href")).toBe("/tours/book?showcase=1&ws=w1");
    expect(side.getByRole("link", { name: "How we tested it" }).getAttribute("href")).toBe("/proof?showcase=1&ws=w1");
  });
  it("lists Charts and Budget (their routes are registered) and has no Team group without a workspace", () => {
    mount("/tours/board?showcase=1");
    const side = within(sidebar()!);
    expect(side.getByRole("link", { name: "Charts" }).getAttribute("href")).toBe("/tours/insights?showcase=1");
    expect(side.getByRole("link", { name: "Budget" }).getAttribute("href")).toBe("/tours/budget?showcase=1");
    expect(side.queryByRole("link", { name: "Insights" })).toBeNull();
    expect(side.queryByText("Team")).toBeNull();
  });
  it("starts expanded at 240px with a toggle wired by aria-expanded and aria-controls", () => {
    mount("/tours/board?showcase=1");
    const t = toggle();
    expect(t.getAttribute("aria-expanded")).toBe("true");
    expect(t.getAttribute("aria-controls")).toBe(sidebar()!.id);
    expect(t.getAttribute("aria-keyshortcuts")).toBe("[");
    expect(sidebar()!.dataset.collapsed).toBe("false");
    expect(document.querySelector<HTMLElement>("[data-nav-grid]")!.style.getPropertyValue("--nav-w")).toBe("240px");
  });
  it("collapses to 64px icons on click, persists, and expands again", () => {
    mount("/tours/board?showcase=1");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(sidebar()!.dataset.collapsed).toBe("true");
    expect(document.querySelector<HTMLElement>("[data-nav-grid]")!.style.getPropertyValue("--nav-w")).toBe("64px");
    expect(localStorage.getItem("tiq.nav.collapsed")).toBe("1");
    fireEvent.click(toggle());
    expect(localStorage.getItem("tiq.nav.collapsed")).toBe("0");
  });
  it("restores the collapsed state from storage", () => {
    localStorage.setItem("tiq.nav.collapsed", "1");
    mount("/tours/board?showcase=1");
    expect(sidebar()!.dataset.collapsed).toBe("true");
  });
  it("the rail scrolls (so every row is reachable on a short screen) and the toggle is pinned first, at the top", () => {
    mount("/tours/board?showcase=1");
    for (const collapsed of [false, true]) {
      if (collapsed) fireEvent.click(toggle());
      const aside = sidebar()!;
      expect(aside.className).toContain("overflow-y-auto");
      expect(aside.className).toContain("scroll-pt-"); // keyboard focus and scrollIntoView stop short of the pinned toggle
      const first = aside.querySelector("button, a")!;
      expect(first).toBe(toggle());
      expect(toggle().parentElement!.className).toMatch(/sticky/);
      expect(toggle().parentElement!.className).toContain("top-0");
    }
  });
  it("the [ key toggles it", () => {
    mount("/tours/board?showcase=1");
    fireEvent.keyDown(document.body, { key: "[" });
    expect(sidebar()!.dataset.collapsed).toBe("true");
  });
  it("with a workspace, Team activity opens the activity panel and Share link shares", async () => {
    const share = vi.fn(async () => ({ url: "https://x/?ws=w", copied: true }));
    mount("/tours/board?showcase=1", { ...OFF, enabled: true, ws: "w", share });
    fireEvent.click(within(sidebar()!).getByRole("button", { name: "Team activity" }));
    expect(screen.getByRole("dialog", { name: "Team activity" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => { fireEvent.click(within(sidebar()!).getByRole("button", { name: "Share link" })); });
    expect(share).toHaveBeenCalledTimes(1);
    expect((await screen.findByRole("status")).textContent).toContain("Link copied");
    expect((await screen.findByRole("status")).closest("[data-toast-viewport]")).not.toBeNull(); // the shared toast, not a bespoke pill
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});

describe("tablet and mobile drawer", () => {
  beforeEach(() => { desktop = false; });
  it("has no rail; the landing page has the hamburger too, so Tours and Team are reachable from home", () => {
    mount("/");
    expect(sidebar()).toBeNull();
    const h = screen.getByRole("button", { name: "Open navigation" });
    expect(h.closest("[data-mobile-bar]")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    fireEvent.click(h);
    expect(within(screen.getByRole("dialog", { name: "Site navigation" })).getByRole("navigation", { name: "Sections" })).toBeTruthy();
  });
  it("the drawer shows a scroll hint while rows are hidden below, and reserves bottom padding", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    mount("/tours/board?showcase=1");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByTestId("drawer-scroll-hint").textContent).toMatch(/Scroll for more/);
    vi.restoreAllMocks();
  });
  it("no scroll hint when everything fits", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    mount("/tours/board?showcase=1");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.queryByTestId("drawer-scroll-hint")).toBeNull();
    vi.restoreAllMocks();
  });
  it("keeps the bottom stepper and adds a hamburger in the top bar", () => {
    mount("/tours/board?showcase=1");
    expect(screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a")).toHaveLength(4);
    const h = screen.getByRole("button", { name: "Open navigation" });
    expect(h.getAttribute("aria-expanded")).toBe("false");
    expect(h.closest("[data-mobile-bar]")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("puts the breadcrumbs in the same top bar as the hamburger (one 44px row)", () => {
    mount("/tours/board?showcase=1");
    const bar = document.querySelector("[data-mobile-bar]")!;
    expect(within(bar as HTMLElement).getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(document.querySelectorAll("nav[aria-label='Breadcrumb']")).toHaveLength(1);
  });
  it("opens a modal drawer with the nav, moves focus in, and closes on Escape returning focus", () => {
    mount("/tours/board?showcase=1");
    const h = screen.getByRole("button", { name: "Open navigation" });
    h.focus();
    fireEvent.click(h);
    const dlg = screen.getByRole("dialog", { name: "Site navigation" });
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(within(dlg).getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(h.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(h);
  });
  it("traps Tab inside the drawer", () => {
    mount("/tours/board?showcase=1");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const dlg = screen.getByRole("dialog", { name: "Site navigation" });
    const focusables = Array.from(dlg.querySelectorAll<HTMLElement>("a[href],button:not([aria-disabled='true'])"));
    const first = focusables[0]!, last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    const outside = screen.getByRole("button", { name: "Open navigation" });
    outside.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dlg.contains(document.activeElement)).toBe(true);
  });
  it("closes when a link is followed, and on the backdrop", () => {
    mount("/tours/board?showcase=1");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Tour Book" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByTestId("nav-drawer-overlay"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("journey stepper on the new-tour form", () => {
  it("?new=1: Markets is current, nothing is done", () => {
    mount("/tours/board?new=1&ws=team42");
    const steps = Array.from(document.querySelectorAll("header [data-step]")).map((e) => `${e.getAttribute("data-step")}:${e.getAttribute("data-state")}`);
    expect(steps).toEqual(["markets:current", "decide:todo", "playbook:todo", "book:todo"]);
  });
  it("the example board still reads Markets done, Decide current", () => {
    mount("/tours/board?showcase=1");
    expect(document.querySelector("header [data-step=markets]")?.getAttribute("data-state")).toBe("done");
    expect(document.querySelector("header [data-step=decide]")?.getAttribute("data-state")).toBe("current");
  });
});
