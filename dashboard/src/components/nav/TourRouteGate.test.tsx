// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { boardReducer, initialBoard } from "@/lib/qloo/tourBoardReducer";
import { OWNER_KEY } from "@/lib/tours/api";
import { buildSavedRun } from "@/lib/tours/savedRun";
import { TourRouteGate } from "./TourRouteGate";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function savedBody() {
  let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
  for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
  return { id: "t-1", title: "x", status: "draft", summary: {}, run: buildSavedRun(s, {}), updatedAt: "u", createdAt: "u" };
}
function Page() {
  const { state } = useTourBoard();
  const { search } = useLocation();
  return <div><span data-testid="artist">{state.brief?.artist ?? "none"}</span><span data-testid="source">{state.source}</span><span data-testid="n">{state.cities.length}</span><span data-testid="q">{search}</span><Link to="/tours/playbook/999?ws=w1">other</Link></div>;
}
function mount(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><TourBoardProvider><TourRouteGate><Routes><Route path="/tours/playbook/:cityId" element={<Page />} /><Route path="/tours/board" element={<Page />} /></Routes></TourRouteGate></TourBoardProvider></MemoryRouter>);
}
let fetched: string[];
beforeEach(() => {
  localStorage.setItem(OWNER_KEY, "tok");
  fetched = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { fetched.push(url); return json(savedBody()); }));
});
afterEach(() => { cleanup(); resetPlaybooks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("TourRouteGate", () => {
  it("saved=<id> with an empty board loads that saved tour (GET /api/tours/<id>) and then renders the page with its run, not the example", async () => {
    mount("/tours/playbook/5746545?saved=t-1&ws=w1");
    expect(screen.queryByTestId("artist")).toBeNull(); // skeleton meanwhile
    await waitFor(() => expect(screen.getByTestId("artist").textContent).toBe(SAMPLE_BRIEF.artist));
    expect(fetched).toEqual(["/api/tours/t-1"]);
    expect(screen.getByTestId("source").textContent).toBe("live");
    expect(Number(screen.getByTestId("n").textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId("q").textContent).toBe("?saved=t-1&ws=w1");
  });

  it("no saved and no showcase/sample on an empty board shows the empty state, never the example", () => {
    mount("/tours/playbook/5746545?ws=w1");
    expect(screen.getByText("This tour isn't open in this tab")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My tours" }).getAttribute("href")).toContain("/tours/mine");
    expect(screen.getByRole("link", { name: "See the example tour" }).getAttribute("href")).toContain("showcase=1");
    expect(screen.queryByTestId("artist")).toBeNull();
    expect(fetched).toEqual([]);
  });

  it("showcase and sample URLs render the page as before", () => {
    mount("/tours/playbook/5746545?showcase=1");
    expect(screen.getByTestId("artist")).toBeTruthy();
    cleanup();
    mount("/tours/playbook/5746545?sample=1");
    expect(screen.getByTestId("artist")).toBeTruthy();
  });

  it("the board route is left alone (it has its own bare-URL behaviour)", () => {
    mount("/tours/board");
    expect(screen.getByTestId("artist")).toBeTruthy();
  });

  it("a saved tour that cannot be fetched says so, with the way out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not_found" }, 404)));
    mount("/tours/playbook/5746545?saved=gone");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("link", { name: "My tours" })).toBeTruthy();
  });

  it("a board that already holds the saved tour never refetches, and a held saved id is put back on a link that dropped it", async () => {
    mount("/tours/playbook/5746545?saved=t-1");
    await waitFor(() => expect(screen.getByTestId("artist")).toBeTruthy());
    expect(fetched.length).toBe(1);
  });

  it("an in-app link that dropped saved gets it back while the board holds the saved tour (no refetch)", async () => {
    mount("/tours/playbook/5746545?saved=t-1");
    await waitFor(() => expect(screen.getByTestId("artist")).toBeTruthy());
    screen.getByText("other").click();
    await waitFor(() => expect(screen.getByTestId("q").textContent).toBe("?ws=w1&saved=t-1"));
    expect(fetched.length).toBe(1);
  });
});
