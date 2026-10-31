// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { samplePlaybookEvents } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "@/lib/qloo/playbookReducer";
import { playbookKey, resetPlaybooks, seedPlaybook } from "@/lib/qloo/playbookStore";
import { ToastProvider } from "@/components/ui/Toast";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import TourBook from "./TourBook";

const loader = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/qloo/playbookStore", async (orig) => ({ ...(await orig<typeof import("@/lib/qloo/playbookStore")>()), loadPlaybook: (...a: unknown[]) => loader.load(...a) }));

configure({ asyncUtilTimeout: 5000 });
const ARTIST = "sample-lumen-vale";
const [DONE, PENDING, FAILED] = ["3530597", "4005539", "3448439"]; // Guadalajara, Curitiba, third city
const done = (id: string): PlaybookState => samplePlaybookEvents(id)!.reduce((s, event) => playbookReducer(s, { type: "event", event }), playbookReducer(initialPlaybook, { type: "start", source: "sample" }));
const errored: PlaybookState = { ...initialPlaybook, status: "error", source: "sample", error: { code: "X", message: "boom" } };
const seed = (id: string, s: PlaybookState) => seedPlaybook(playbookKey(ARTIST, id), s);

function Pick({ ids }: { ids: string[] }) {
  const { state, setShortlist } = useTourBoard();
  useEffect(() => { if (state.status === "done") setShortlist(ids); }, [state.status, setShortlist, ids]);
  return null;
}
const renderBook = (ids: string[]) => render(
  <QueryClientProvider client={new QueryClient()}>
    <ToastProvider><TourBoardProvider sampleDelayMs={0}>
      <MemoryRouter initialEntries={["/tours/book?sample=1"]}>
        <Routes><Route path="/tours/book" element={<TourBook />} /></Routes>
        <Pick ids={ids} />
      </MemoryRouter>
    </TourBoardProvider></ToastProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  loader.load.mockReset();
  loader.load.mockImplementation(() => new Promise(() => {})); // never settles: a hung city
});
afterEach(() => { cleanup(); resetPlaybooks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("TourBook progressive rendering", () => {
  it("shows the shell, ready chapter, a building placeholder and a failed chapter whose Retry reloads only that city", async () => {
    seed(DONE, done(DONE));
    seed(FAILED, errored);
    renderBook([DONE, PENDING, FAILED]);
    await screen.findByRole("heading", { name: "Guadalajara", level: 2 });
    expect(screen.getByTestId("book-which-tour")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Market selection/i })).toBeTruthy();
    expect(screen.getAllByText(/building this chapter/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toMatch(/1 of 3 chapters ready/);
    expect(screen.getAllByText("Couldn't build this chapter.")).toHaveLength(1);
    expect(screen.queryByText(/Playbook incomplete/)).toBeNull();
    loader.load.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(loader.load.mock.calls[0]![0].city.id).toBe(FAILED);
  });

  it("a city with no result after 120 s becomes a failed chapter without blocking the others", async () => {
    seed(DONE, done(DONE));
    renderBook([DONE, PENDING]);
    await screen.findByRole("heading", { name: "Guadalajara", level: 2 });
    expect(screen.queryByText("Couldn't build this chapter.")).toBeNull();
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(121_000); });
    expect(screen.getAllByText("Couldn't build this chapter.")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Guadalajara", level: 2 })).toBeTruthy();
    expect(within(screen.getByRole("status")).getByText(/1 of 2 chapters ready/)).toBeTruthy();
  });

  it("with every playbook cached there are no placeholders and no progress line", async () => {
    for (const id of [DONE, PENDING]) seed(id, done(id));
    renderBook([DONE, PENDING]);
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    expect(screen.queryByText(/building this chapter/i)).toBeNull();
    expect(screen.queryByText(/chapters ready/)).toBeNull();
    expect(screen.queryByText("Couldn't build this chapter.")).toBeNull();
  });
});
