// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import CityPlaybook from "./CityPlaybook";
import TourBoard from "./TourBoard";
import TourBook from "./TourBook";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

// One macrotask: drains every microtask-chained event, but never advances a paced (>0 ms) replay.
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const SCORED = (syntheticShowcase.boardEvents as Array<{ type: string }>).filter((e) => e.type === "city_scored").length;

const renderAt = (url: string) => render(
  <QueryClientProvider client={new QueryClient()}>
    <TourBoardProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/tours/board" element={<TourBoard />} />
          <Route path="/tours/book" element={<TourBook />} />
          <Route path="/tours/playbook/:cityId" element={<CityPlaybook />} />
        </Routes>
      </MemoryRouter>
    </TourBoardProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  setShowcase(parseShowcase(syntheticShowcase));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); resetPlaybooks(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("the showcase opens finished", () => {
  it("the board shows every recorded city after one flush, no waiting text, and a Replay button", async () => {
    renderAt("/tours/board?showcase=1");
    await flush();
    expect(screen.getAllByTestId("city-row")).toHaveLength(SCORED);
    expect(screen.queryByText("Waiting for the board to finish…")).toBeNull();
    expect(screen.getByRole("button", { name: "Replay the agent" })).toBeTruthy();
  });
  it("Replay the agent restarts the stream at a positive delay", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    renderAt("/tours/board?showcase=1");
    await flush();
    expect(spy.mock.calls[0]![1]?.delayMs ?? 0).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Replay the agent" }));
    const last = spy.mock.calls[spy.mock.calls.length - 1]!;
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    expect(last[1]?.delayMs).toBeGreaterThan(0);
    cleanup();
  });
  it("live mode has no Replay button", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      yield { type: "resolve", entity: { entityId: "A", name: "X" } };
      yield { type: "done", summary: {} };
    });
    renderAt("/tours/board?sample=1");
    await flush();
    expect(screen.queryByRole("button", { name: "Replay the agent" })).toBeNull();
  });
  it("the Tour Book opens directly on the finished book", async () => {
    renderAt("/tours/book?showcase=1");
    await flush();
    expect(screen.queryByText("Waiting for the board to finish…")).toBeNull();
    expect(screen.queryByText(/Preparing playbooks/)).toBeNull();
    expect(document.querySelector("[data-print-footer]")).toBeTruthy();
  });
  it("a playbook opens directly on its cards", async () => {
    renderAt("/tours/playbook/4013708?showcase=1");
    await flush();
    expect(document.querySelector(".skeleton")).toBeNull();
  });
});
