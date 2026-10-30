import { describe, expect, it } from "vitest";
import { isRouteAvailable, NAV_GROUPS, visibleNavGroups, type NavItem } from "./navConfig";

const items = (): NavItem[] => NAV_GROUPS.flatMap((g) => g.items);
const byId = (id: string) => items().find((i) => i.id === id)!;
const ROUTES = ["/", "/tours/board", "/tours/playbook/:cityId", "/tours/book", "/proof", "/agents", "/v2"];

describe("nav config", () => {
  it("has the three groups in order with the requested items", () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items.map((i) => i.label)])).toEqual([
      ["Plan", ["Overview", "Tour Board", "Playbooks", "Tour Book", "Insights", "Budget"]],
      ["Team", ["Team activity", "Share link"]],
      ["More", ["How we tested it", "Use from your AI agent", "What's next"]],
    ]);
  });
  it("every item has an inline icon component and a unique id", () => {
    expect(new Set(items().map((i) => i.id)).size).toBe(items().length);
    for (const i of items()) expect(i.icon).toBeTruthy();
  });

  it.each([
    ["overview", "/", ["/"], ["/tours/board", "/proof"]],
    ["board", "/tours/board", ["/tours/board"], ["/", "/tours/book"]],
    ["playbooks", null, ["/tours/playbook/3530597", "/tours/playbook/x"], ["/tours/board", "/tours/book"]],
    ["book", "/tours/book", ["/tours/book"], ["/tours/board"]],
    ["insights", "/tours/insights", ["/tours/insights", "/insights"], ["/tours/board"]],
    ["budget", "/tours/budget", ["/tours/budget"], ["/tours/book"]],
    ["proof", "/proof", ["/proof"], ["/"]],
    ["agents", "/agents", ["/agents"], ["/proof"]],
    ["v2", "/v2", ["/v2"], ["/agents"]],
  ] as const)("%s: path and active matching", (id, path, yes, no) => {
    const item = byId(id);
    if (item.kind !== "route") throw new Error("expected route item");
    expect(item.path).toBe(path);
    for (const p of yes) expect(item.match(p), p).toBe(true);
    for (const p of no) expect(item.match(p), p).toBe(false);
  });

  it("team items are actions, not routes, and need a workspace", () => {
    expect(byId("team-activity")).toMatchObject({ kind: "action", action: "activity", needsWorkspace: true });
    expect(byId("share")).toMatchObject({ kind: "action", action: "share", needsWorkspace: true });
  });
});

describe("route availability gating", () => {
  it("matches static and parameterised registered routes", () => {
    expect(isRouteAvailable("/tours/board", ROUTES)).toBe(true);
    expect(isRouteAvailable("/tours/playbook/3", ROUTES)).toBe(true);
    expect(isRouteAvailable("/tours/insights", ROUTES)).toBe(false);
    expect(isRouteAvailable("/tours/budget", ROUTES)).toBe(false);
  });
  it("hides insights and budget until their routes are registered, then shows them", () => {
    const labels = (routes: string[]) => visibleNavGroups({ routes, hasWorkspace: true }).flatMap((g) => g.items.map((i) => i.label));
    expect(labels(ROUTES)).not.toContain("Insights");
    expect(labels(ROUTES)).not.toContain("Budget");
    const merged = labels([...ROUTES, "/tours/insights", "/tours/budget"]);
    expect(merged).toContain("Insights");
    expect(merged).toContain("Budget");
  });
  it("hides the Team group entirely without a workspace", () => {
    const groups = visibleNavGroups({ routes: ROUTES, hasWorkspace: false });
    expect(groups.map((g) => g.label)).toEqual(["Plan", "More"]);
  });
  it("shows Team activity and Share link with a workspace", () => {
    const team = visibleNavGroups({ routes: ROUTES, hasWorkspace: true }).find((g) => g.label === "Team")!;
    expect(team.items.map((i) => i.label)).toEqual(["Team activity", "Share link"]);
  });
});
