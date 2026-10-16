// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("@/lib/campaignContext", () => ({ useCampaignContext: () => ({ campaigns: [], activeCampaignId: "x", activeCampaign: undefined, setActiveCampaignId() {}, refresh() {} }) }));

const mm = (desktop: boolean) => vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }));

describe("AppShell", () => {
  it("mobile renders a bottom tab bar with four tabs and no sidebar", () => {
    mm(false);
    render(<MemoryRouter initialEntries={["/tours/board"]}><AppShell><p>child</p></AppShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /Tours/ }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("aside")).toBeNull();
  });
  it("desktop renders the top bar wordmark and links", () => {
    mm(true);
    render(<MemoryRouter initialEntries={["/"]}><AppShell><p>child</p></AppShell></MemoryRouter>);
    expect(screen.getByText("Tour Intelligence")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Insights" })).toBeTruthy();
  });
});
