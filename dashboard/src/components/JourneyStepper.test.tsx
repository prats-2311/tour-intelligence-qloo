// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { boardReducer, initialBoard } from "@/lib/qloo/tourBoardReducer";
import { buildSavedRun } from "@/lib/tours/savedRun";
import { JourneyStepper } from "./JourneyStepper";

afterEach(cleanup);
function Loader() {
  const { loadSaved } = useTourBoard();
  useEffect(() => {
    let s = boardReducer(initialBoard, { type: "start", brief: SAMPLE_BRIEF, source: "live" });
    for (const event of LUMEN_VALE_SAMPLE) s = boardReducer(s, { type: "event", event });
    loadSaved(buildSavedRun(s, {}), "t-1");
  }, [loadSaved]);
  return null;
}
const at = (url: string) => render(<TourBoardProvider><MemoryRouter initialEntries={[url]}><Loader /><JourneyStepper variant="top" /></MemoryRouter></TourBoardProvider>);
const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href")!;

describe("JourneyStepper links keep the current query", () => {
  it("carries saved and ws onto the Tour Book step", () => {
    at("/tours/board?saved=t-1&ws=w1");
    const h = href(/Tour Book/);
    expect(h.startsWith("/tours/book?")).toBe(true);
    expect(h).toContain("saved=t-1");
    expect(h).toContain("ws=w1");
  });
  it("carries them onto the Decide step too", () => {
    at("/tours/book?ws=w1&saved=t-1");
    const h = href(/Decide/);
    expect(h).toContain("saved=t-1");
    expect(h).toContain("ws=w1");
  });
});
