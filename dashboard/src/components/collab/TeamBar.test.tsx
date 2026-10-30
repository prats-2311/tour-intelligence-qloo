// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { OFF, WorkspaceContext, type Workspace } from "@/lib/collab/workspaceContext";
import { TeamBar } from "./TeamBar";

const wide = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on || !q.includes("1280"), addEventListener() {}, removeEventListener() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const share = vi.fn(async () => ({ url: "https://x.test/?ws=abc", copied: true }));
const ws = (): Workspace => ({ ...OFF, enabled: true, ws: "abc12345", identity: { name: "Sam", role: "Manager" }, share });
const mount = () => render(<MemoryRouter><ToastProvider><WorkspaceContext.Provider value={ws()}><TeamBar cities={[{ id: "1", name: "Home" }]} tourThread="tour:board" /></WorkspaceContext.Provider></ToastProvider></MemoryRouter>);

describe("TeamBar at 1280px and wider", () => {
  it("keeps the secondary actions inline, in one row, with no Team menu", () => {
    wide(true); mount();
    for (const n of ["Team activity", "Share with your team"]) expect(screen.getByRole("button", { name: n })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tour notes for the whole tour/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Team" })).toBeNull();
    expect(screen.getByTestId("team-bar").className).toMatch(/flex-nowrap/);
  });
});

describe("TeamBar below 1280px", () => {
  it("groups Tour notes, Team activity and Share into one Team menu button", () => {
    wide(false); mount();
    const btn = screen.getByRole("button", { name: "Team" });
    expect(btn.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.className).toMatch(/min-h-11/);
    expect(screen.queryByRole("button", { name: "Share with your team" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("opens an accessible menu: arrow keys move, Escape closes and returns focus", () => {
    wide(false); mount();
    const btn = screen.getByRole("button", { name: "Team" });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Team" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Tour notes (0)", "Team activity", "Share with your team", "Writing as Sam · Manager"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
  it("the open menu floats over the page (absolute) so it never moves the row", () => {
    wide(false); mount();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByRole("menu").className).toMatch(/absolute/);
    expect(screen.getByTestId("team-bar").className).toMatch(/relative/);
  });
  it("Share from the menu copies, closes the menu and toasts; nothing is inserted into the row", async () => {
    wide(false); mount();
    const bar = screen.getByTestId("team-bar");
    const before = bar.innerHTML;
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Share with your team" })); });
    expect(share).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Link copied.");
    expect(bar.innerHTML).toBe(before);
  });
  it("Team activity from the menu opens the activity panel; Tour notes opens the notes sheet", () => {
    wide(false); mount();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Team activity" }));
    expect(screen.getByRole("dialog", { name: "Team activity" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Tour notes/ }));
    expect(screen.getByRole("dialog", { name: /Notes: the whole tour/ })).toBeTruthy();
  });
  it("clicking outside closes it", () => {
    wide(false); mount();
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
