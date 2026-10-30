// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { navHref } from "@/lib/nav/navQuery";
import { visibleNavGroups } from "@/lib/nav/navConfig";
import { NavList } from "./NavList";

const ROUTES = ["/", "/tours/board", "/tours/playbook/:cityId", "/tours/book", "/proof", "/agents", "/v2"];
const base = { groups: visibleNavGroups({ routes: ROUTES, hasWorkspace: true }), pathname: "/tours/board", hrefFor: (p: string) => navHref(p, "?showcase=1", ""), playbookHref: "/tours/playbook/9?showcase=1", collapsed: false, onAction: () => {} };
const mount = (over: Partial<Parameters<typeof NavList>[0]> = {}) => render(<MemoryRouter><NavList {...base} {...over} /></MemoryRouter>);

describe("NavList", () => {
  it("renders the groups with headings and a labelled nav", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(Array.from(nav.querySelectorAll("h2")).map((h) => h.textContent)).toEqual(["Plan", "Team", "More"]);
  });
  it("every route link goes through hrefFor, so showcase/sample/ws are kept", () => {
    mount();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/?showcase=1");
    expect(screen.getByRole("link", { name: "Tour Book" }).getAttribute("href")).toBe("/tours/book?showcase=1");
    expect(screen.getByRole("link", { name: "How we tested it" }).getAttribute("href")).toBe("/proof?showcase=1");
    expect(screen.getByRole("link", { name: "What's next" }).getAttribute("href")).toBe("/v2?showcase=1");
  });
  it("Playbooks leads to the current city playbook", () => {
    mount();
    expect(screen.getByRole("link", { name: "Playbooks" }).getAttribute("href")).toBe("/tours/playbook/9?showcase=1");
  });
  it("marks only the active item with aria-current=page", () => {
    mount();
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Tour Board");
  });
  it("on a playbook route the Playbooks item is current", () => {
    mount({ pathname: "/tours/playbook/9" });
    expect(screen.getByRole("link", { name: "Playbooks" }).getAttribute("aria-current")).toBe("page");
  });
  it("Playbooks is disabled with a hint when there is no playbook", () => {
    mount({ playbookHref: null });
    expect(screen.queryByRole("button", { name: /Playbook/ })).toBeNull();
    const btn = screen.getByRole("link", { name: "Playbooks" });
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(btn.getAttribute("href")).toBeNull();
    expect(btn.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Open a city on the Tour Board first")).toBeTruthy();
  });
  it("team items are buttons that call onAction", () => {
    const onAction = vi.fn();
    mount({ onAction });
    fireEvent.click(screen.getByRole("button", { name: "Team activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(onAction.mock.calls).toEqual([["activity"], ["share"]]);
  });
  it("without a workspace there are no team items or Team heading", () => {
    mount({ groups: visibleNavGroups({ routes: ROUTES, hasWorkspace: false }) });
    expect(screen.queryByRole("button", { name: "Team activity" })).toBeNull();
    expect(screen.queryByText("Team")).toBeNull();
  });
  it("collapsed: labels stay as accessible names, with tooltips and no visible headings", () => {
    mount({ collapsed: true });
    const link = screen.getByRole("link", { name: "Tour Board" });
    expect(within(link).getByText("Tour Board").className).toContain("sr-only");
    expect(link.querySelector('[role="tooltip"]')).toBeNull();
    expect(link.parentElement!.querySelector("[data-tooltip]")?.textContent).toBe("Tour Board");
    expect(document.querySelectorAll("h2.sr-only")).toHaveLength(3);
  });
  it("expanded: labels are visible and there are no tooltips", () => {
    mount();
    expect(within(screen.getByRole("link", { name: "Tour Board" })).getByText("Tour Board").className).not.toContain("sr-only");
    expect(document.querySelector("[data-tooltip]")).toBeNull();
  });
  it("calls onNavigate when a link is followed (the drawer closes on it)", () => {
    const onNavigate = vi.fn();
    mount({ onNavigate });
    fireEvent.click(screen.getByRole("link", { name: "Tour Book" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
