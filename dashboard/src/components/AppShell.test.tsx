// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { AppShell } from "./AppShell";

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppShell", () => {
  it("mobile renders a bottom bar with the four journey steps and no sidebar", () => {
    mm(false);
    render(<MemoryRouter initialEntries={["/tours/board"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.textContent?.replace(/\s*\(done\)/, "").replace(/^\d+/, "").trim())).toEqual(["Markets", "Decide", "Playbook", "Tour Book"]);
    for (const a of Array.from(nav.querySelectorAll("a"))) expect((a.textContent ?? "").replace(/^\d+|\s*\(done\)/g, "").trim().length).toBeLessThanOrEqual(10);
    expect(screen.getByRole("link", { name: /Decide/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("aside")).toBeNull();
  });
  it("desktop renders the top bar wordmark and the same four steps", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    expect(screen.getByText("Tour Intelligence")).toBeTruthy();
    const mark = document.querySelector('header img[src="/favicon.svg"]');
    expect(mark?.getAttribute("alt")).toBe("");
    expect(mark?.nextElementSibling?.textContent).toBe("Tour Intelligence");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual(["/", "/tours/board?sample=1", expect.stringMatching(/^\/tours\/playbook\/\d+\?sample=1$/), "/tours/book?sample=1"]);
    expect(screen.queryByRole("link", { name: "Taste" })).toBeNull();
  });
  it("numbers the steps, marks the current one and the steps before it as done", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/tours/playbook/3530597"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const steps = Array.from(document.querySelectorAll("[data-step]")).map((li) => [li.getAttribute("data-step"), li.getAttribute("data-state")]);
    expect(steps).toEqual([["markets", "done"], ["decide", "done"], ["playbook", "current"], ["book", "todo"]]);
    expect(document.querySelector('[data-step="book"]')?.textContent).toContain("4");
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: /Playbook/ }).getAttribute("aria-current")).toBe("page");
  });
  it("off the main path (Taste, Proof) nothing is current and nothing is marked done", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/insights"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    expect(Array.from(document.querySelectorAll("[data-step]")).map((li) => li.getAttribute("data-state"))).toEqual(["todo", "todo", "todo", "todo"]);
  });
  it("on the landing route no step is active, current or done", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    expect(Array.from(document.querySelectorAll("[data-step]")).map((li) => li.getAttribute("data-state"))).toEqual(["todo", "todo", "todo", "todo"]);
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });
  it("primary nav shows only the four steps and no campaign controls", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/tours/board"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByText("child")).toBeTruthy();
    expect(screen.queryByText(/Active Campaign/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Compare|Add cities/i })).toBeNull();
  });
});
