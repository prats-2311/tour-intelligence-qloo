// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF } from "./fixtures/lumenVale";
import { TourBoardProvider, useTourBoard } from "./TourBoardProvider";
import * as client from "./client";

function Probe() {
  const { state, run, abort } = useTourBoard();
  return (<div>
    <span data-testid="status">{state.status}</span>
    <span data-testid="count">{state.cities.length}</span>
    <button onClick={() => run(SAMPLE_BRIEF, { sample: true })}>run</button>
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
  it("a second run aborts the first (never two streams — Review Focus 5)", async () => {
    const spy = vi.spyOn(client, "streamTourBoard");
    render(<TourBoardProvider sampleDelayMs={5}><Probe /></TourBoardProvider>);
    act(() => { screen.getByText("run").click(); screen.getByText("run").click(); });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("done"));
    const signals = spy.mock.calls.map((c) => c[1]?.signal);
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.getByTestId("count").textContent).toBe("10");
  });
  it("a stream that ends without done becomes interrupted (Review Focus 1)", async () => {
    vi.spyOn(client, "streamTourBoard").mockImplementation(async function* () { yield { type: "resolve", entity: { entityId: "A", name: "X" } }; });
    render(<TourBoardProvider><Probe /></TourBoardProvider>);
    act(() => screen.getByText("run").click());
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("interrupted"));
  });
});
