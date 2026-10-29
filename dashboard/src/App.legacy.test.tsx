// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { WebMcpTools } from "@/components/WebMcpTools";
import App from "./App";

vi.mock("./pages/TourBoard", () => ({ TourBoard: () => <p>board page</p>, default: () => <p>board page</p> }));

const mm = () => vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mm();
  fetchSpy = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); });

function Where() { return <output data-testid="where">{useLocation().pathname}</output>; }
function mount(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><TourBoardProvider><App /><Where /></TourBoardProvider></MemoryRouter></QueryClientProvider>,
  );
}

describe("legacy campaign routes", () => {
  it.each(["/campaign", "/city/mumbai", "/compare", "/campaigns/new", "/cities/add"])("%s redirects to the board", async (path) => {
    mount(path);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/tours/board"));
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

describe("WebMcpTools", () => {
  it("still registers the same tool names", async () => {
    const names: string[] = [];
    (document as unknown as { modelContext: unknown }).modelContext = { registerTool(t: { name: string }) { names.push(t.name); } };
    render(<MemoryRouter><WebMcpTools /></MemoryRouter>);
    await waitFor(() => expect(names.length).toBeGreaterThan(0));
    expect(names).toEqual(["list_campaigns", "get_campaign_overview", "get_city_detail", "create_campaign", "generate_briefs"]);
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });
});
