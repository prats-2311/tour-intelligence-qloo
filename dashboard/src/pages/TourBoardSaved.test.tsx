// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { boardReducer, initialBoard } from "@/lib/qloo/tourBoardReducer";
import { OWNER_KEY } from "@/lib/tours/api";
import { buildSavedRun } from "@/lib/tours/savedRun";
import TourBoard from "./TourBoard";
import { Breadcrumbs } from "@/components/nav/Breadcrumbs";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function savedRun() {
  let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
  for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
  return buildSavedRun(s, {});
}
let calls: string[];
let handler: (url: string) => Response;
beforeEach(() => {
  localStorage.clear(); localStorage.setItem(OWNER_KEY, "tok");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  calls = [];
  handler = (url) => (url === "/api/tours/abc" ? json({ id: "abc", title: "Lumen Vale tour", status: "draft", run: savedRun() }) : json({ error: "nf" }, 404));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return handler(url); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const mount = (url: string) => render(
  <ToastProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TourBoardProvider><MemoryRouter initialEntries={[url]}><Breadcrumbs /><TourBoard /><Where /></MemoryRouter></TourBoardProvider>
  </QueryClientProvider></ToastProvider>,
);

describe("Tour Board opened from a saved tour", () => {
  it("?saved=<id> loads the stored run: the board opens finished with its cities and makes no Qloo call", async () => {
    mount("/tours/board?saved=abc");
    expect((await screen.findAllByTestId("city-row")).length).toBe(10);
    expect(calls).toEqual(["/api/tours/abc"]);
    expect(calls.some((c) => c.startsWith("/api/qloo/"))).toBe(false);
    const trail = Array.from(document.querySelectorAll("[data-breadcrumbs] li"), (li) => li.textContent);
    expect(trail).toEqual(["Overview", "Lumen Vale tour", "Tour Board"]);
  });
  it("a tour that no longer exists says so and links to My tours", async () => {
    mount("/tours/board?saved=gone");
    expect(await screen.findByText("That saved tour no longer exists.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to My tours" }).getAttribute("href")).toBe("/tours/mine");
    expect(screen.queryByTestId("city-row")).toBeNull();
  });
  it("a stored run that cannot be read is reported, not a blank board", async () => {
    handler = () => json({ id: "abc", run: { v: 9 } });
    mount("/tours/board?saved=abc");
    expect(await screen.findByText(/couldn't be opened/)).toBeTruthy();
  });
  it("does not fetch again once the board holds the tour", async () => {
    const { rerender } = mount("/tours/board?saved=abc");
    await screen.findAllByTestId("city-row");
    await waitFor(() => expect(calls.length).toBe(1));
    rerender(<ToastProvider><QueryClientProvider client={new QueryClient()}><TourBoardProvider><MemoryRouter initialEntries={["/tours/board?saved=abc"]}><TourBoard /></MemoryRouter></TourBoardProvider></QueryClientProvider></ToastProvider>);
    expect(calls.filter((c) => c === "/api/tours/abc").length).toBeLessThanOrEqual(2);
  });
  it("the Plan a tour form links to My tours", async () => {
    mount("/tours/board?new=1");
    const link = await screen.findByRole("link", { name: /Your saved tours/ });
    expect(link.getAttribute("href")).toBe("/tours/mine");
  });
});
