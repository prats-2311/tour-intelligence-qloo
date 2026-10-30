// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import App from "./App";

vi.mock("./pages/TourBoard", () => ({ TourBoard: () => <p>board page</p>, default: () => <p>board page</p> }));

const mm = () => vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mm();
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); }); // unmount before the matchMedia stub goes, or a late re-render throws in the next test

function Where() { return <output data-testid="where">{useLocation().pathname}</output>; }
function mount(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><TourBoardProvider><App /><Where /></TourBoardProvider></MemoryRouter></QueryClientProvider>,
  );
}

describe("shell: legacy campaign routes redirect to the board", () => {
  it.each(["/campaign", "/city/mumbai", "/compare", "/campaigns/new", "/cities/add"])("%s redirects to the board", async (path) => {
    mount(path);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/tours/board"));
  });
  it("/tours/budget is a route of its own", async () => {
    mount("/tours/budget?sample=1");
    expect(await screen.findByRole("heading", { name: "Tour budget", level: 1 })).toBeTruthy();
  });
  it("an unknown route shows a not-found page with a way back", async () => {
    mount("/nope");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the example tour" }).getAttribute("href")).toBe("/");
  });
  it("no page load fetches /api/campaigns", async () => {
    mount("/tours/board");
    await screen.findByText("board page");
    await new Promise((r) => setTimeout(r, 50));
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes("/api/campaigns"))).toEqual([]);
  });
  it("the shell no longer shows the Active Campaign block", async () => {
    mount("/tours/board");
    await screen.findByText("board page");
    expect(screen.queryByText(/Active Campaign/i)).toBeNull();
    expect(screen.queryByText(/Nova Horizon/i)).toBeNull();
  });
});

describe("shell: WebMCP tools", () => {
  it("registers only the Qloo tools, never the legacy campaign tools", async () => {
    const names: string[] = [];
    (document as unknown as { modelContext: unknown }).modelContext = { registerTool(t: { name: string }) { names.push(t.name); } };
    try {
      mount("/tours/board");
      await screen.findByText("board page");
      await waitFor(() => expect(names).toContain("get_tour_board"));
      for (const legacy of ["list_campaigns", "get_campaign_overview", "get_city_detail", "create_campaign", "generate_briefs"]) {
        expect(names).not.toContain(legacy);
      }
    } finally {
      delete (document as unknown as { modelContext?: unknown }).modelContext;
    }
  });
});
