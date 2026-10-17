// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { AppShell } from "./AppShell";

vi.mock("@/lib/campaignContext", () => ({ useCampaignContext: () => ({ campaigns: [], activeCampaignId: "x", activeCampaign: undefined, setActiveCampaignId() {}, refresh() {} }) }));

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AppShell", () => {
  it("mobile renders a bottom tab bar with three tabs and no sidebar", () => {
    mm(false);
    render(<MemoryRouter initialEntries={["/tours/board"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Tours/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("aside")).toBeNull();
  });
  it("desktop renders the top bar wordmark and links", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    expect(screen.getByText("Tour Intelligence")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Taste" })).toBeTruthy();
  });
  it("campaign routes expose Compare and Add Cities links", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/campaign"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const compare = screen.getByRole("link", { name: /Compare/ });
    expect(compare.getAttribute("href")).toBe("/compare");
    expect(compare.getAttribute("data-tour")).toBe("compare-cities-nav");
    expect(screen.getByRole("link", { name: /Add cities/i }).getAttribute("href")).toBe("/cities/add");
  });
  it("switcher toggle reports aria-expanded and closes on Escape", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/campaign"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const btn = screen.getByRole("button", { name: /Active Campaign/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
  it("primary nav shows only Discover, Tours, Taste; /campaign still renders by URL", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/campaign"]}><TourBoardProvider><AppShell><p>child</p></AppShell></TourBoardProvider></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(Array.from(nav.querySelectorAll("a")).map((a) => a.textContent?.trim())).toEqual(["Discover", "Tours", "Taste"]);
    expect(screen.getByText("child")).toBeTruthy();
  });
});
