// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import * as client from "@/lib/qloo/client";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import TourBook from "./TourBook";

const refresh = vi.fn(async () => undefined);
const setActiveCampaignId = vi.fn();
vi.mock("@/lib/campaignContext", () => ({ useCampaignContext: () => ({ refresh, setActiveCampaignId }) }));

configure({ asyncUtilTimeout: 5000 });

// A live-shaped run: the provider streams in live mode while the client replays the sample events.
function RunLive() {
  const { run } = useTourBoard();
  useEffect(() => { run(SAMPLE_BRIEF, { sample: false }); }, [run]);
  return null;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const realBoard = client.streamTourBoard;
  const realPlaybook = client.streamCityPlaybook;
  vi.spyOn(client, "streamTourBoard").mockImplementation((brief, o) => realBoard(brief, { ...o, sample: true, delayMs: 0 }));
  vi.spyOn(client, "streamCityPlaybook").mockImplementation((q, o) => realPlaybook(q, { ...o, sample: true, delayMs: 0 }));
  vi.spyOn(client, "fetchThisWeek").mockImplementation(async (_q, o) => sampleThisWeek(o?.cityId ?? "") ?? { status: "unavailable", reason: "error", message: "x" });
});
afterEach(() => {
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
  setActiveCampaignId.mockClear();
});

const renderLive = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={["/tours/book"]}>
          <Routes>
            <Route path="/tours/book" element={<TourBook />} />
            <Route path="/campaign" element={<p>campaign page</p>} />
          </Routes>
          <RunLive />
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>,
  );

describe("Save as campaign", () => {
  it("saves a live tour, refreshes campaigns before selecting the new one, and offers Open campaign", async () => {
    const save = vi.spyOn(api, "saveTourAsCampaign").mockResolvedValue({ campaign_id: "c1", stops: 4 });
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: "Save as campaign" }));
    expect(await screen.findByRole("link", { name: "Open campaign" })).toBeTruthy();
    const input = save.mock.calls[0]![0];
    expect(input).toMatchObject({ artist: "Lumen Vale", artist_entity_id: "sample-lumen-vale", regions: SAMPLE_BRIEF.regions, date_window: SAMPLE_BRIEF.dateWindow });
    expect(input.cities.map((c) => c.name)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
    expect(JSON.parse(input.board_json).chapters).toHaveLength(4);
    expect(refresh).toHaveBeenCalled();
    expect(setActiveCampaignId).toHaveBeenCalledWith("c1");
    expect(refresh.mock.invocationCallOrder[0]!).toBeLessThan(setActiveCampaignId.mock.invocationCallOrder[0]!);
  });
  it("shows one honest sentence and Try again when saving fails", async () => {
    vi.spyOn(api, "saveTourAsCampaign").mockRejectedValueOnce(new Error("tour_data_api unavailable"));
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: "Save as campaign" }));
    expect(await screen.findByText("Couldn't save the campaign — tour_data_api unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(setActiveCampaignId).not.toHaveBeenCalled();
  });
});
