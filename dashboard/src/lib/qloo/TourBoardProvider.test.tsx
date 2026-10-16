// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "./fixtures/lumenVale";
import { TourBoardProvider, useTourBoard } from "./TourBoardProvider";
import * as client from "./client";
import type { GatewayEvent } from "./types";

function Probe() {
  const { state, run, abort } = useTourBoard();
  return (<div>
    <span data-testid="status">{state.status}</span>
    <span data-testid="count">{state.cities.length}</span>
    <span data-testid="artist">{state.artist?.name ?? ""}</span>
    <span data-testid="log">{state.log.length}</span>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>run</button>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true, sampleSet: "long" })}>runlong</button>
    <button onClick={abort}>abort</button>
  </div>);
}

afterEach(() => { vi.restoreAllMocks(); });

describe("TourBoardProvider", () => {
  it("runs a sample stream to done", async () => {
    render(<TourBoardProvider sampleDelayMs={0}><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    expect(screen.getByTestId("count").textContent).toBe("10");
  });
  it("run({sampleSet:'long'}) streams the long-names sample", async () => {
    render(<TourBoardProvider sampleDelayMs={0}><Probe /></TourBoardProvider>);
    act(() => screen.getByText("runlong").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    expect(screen.getByTestId("artist").textContent).toBe("Lumen Vale & The Extraordinarily Long Orchestra");
  });
  it("a second run aborts the first (never two streams — Review Focus 5)", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    render(<TourBoardProvider sampleDelayMs={5}><Probe /></TourBoardProvider>);
    act(() => { screen.getByText("run").click(); screen.getByText("run").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    const signals = spy.mock.calls.map((c) => c[1]?.signal);
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.getByTestId("count").textContent).toBe("10");
    expect(screen.getByTestId("log").textContent).toBe(String(LUMEN_VALE_SAMPLE.length));
  });
  it("explicit abort marks a live stream interrupted (R9)", async () => {
    render(<TourBoardProvider sampleDelayMs={20}><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    expect(screen.getByTestId("status").textContent).toBe("streaming");
    act(() => screen.getByText("abort").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("interrupted"));
  });
  it("a stale stream that ignores its signal never dispatches into a newer run", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const staleCity = { ...LUMEN_VALE_SAMPLE.find((e) => e.type === "city_scored")! } as Extract<GatewayEvent, { type: "city_scored" }>;
    let call = 0;
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () {
      call += 1;
      if (call === 1) {
        await gate;
        yield { type: "resolve", entity: { entityId: "STALE", name: "Stale Artist" } };
        yield { type: "city_scored", city: { ...staleCity.city, id: "STALE-CITY" } };
        yield { type: "done", summary: {} };
        return;
      }
      yield { type: "resolve", entity: { entityId: "B", name: "Fresh Artist" } };
      yield { type: "done", summary: {} };
    });
    render(<TourBoardProvider><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId("artist").textContent).toBe("Fresh Artist");
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("log").textContent).toBe("2");
  });
  it("a network TypeError becomes interrupted", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { throw new TypeError("network error"); });
    render(<TourBoardProvider><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("interrupted"));
  });
  it("a stream that ends without done becomes interrupted (Review Focus 1)", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "resolve", entity: { entityId: "A", name: "X" } }; });
    render(<TourBoardProvider><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("interrupted"));
  });
});
