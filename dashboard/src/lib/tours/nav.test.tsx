// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCrumbs } from "@/lib/nav/breadcrumbs";
import { visibleNavGroups } from "@/lib/nav/navConfig";
import { routeKey } from "@/lib/routePreload";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import App from "@/App";

vi.mock("@/pages/MyTours", () => ({ default: () => <p>my tours page</p> }));

afterEach(cleanup);
describe("My tours navigation", () => {
  it("the Plan section lists My tours right after Tour Board", () => {
    const plan = visibleNavGroups({ hasWorkspace: false }).find((g) => g.id === "plan")!;
    const labels = plan.items.map((i) => i.label);
    expect(labels.indexOf("My tours")).toBe(labels.indexOf("Tour Board") + 1);
    const item = plan.items.find((i) => i.label === "My tours")!;
    expect(item.kind === "route" && item.path).toBe("/tours/mine");
    expect(item.kind === "route" && item.match("/tours/mine")).toBe(true);
  });
  it("breadcrumb is Overview > My tours", () => {
    expect(buildCrumbs({ pathname: "/tours/mine", artist: null, cityName: null }).map((c) => c.label)).toEqual(["Overview", "My tours"]);
  });
  it("is a lazy route that preloads", () => { expect(routeKey("/tours/mine")).toBe("mine"); });
  it("the app routes /tours/mine to the page", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/tours/mine"]}><TourBoardProvider><App /></TourBoardProvider></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("my tours page")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
