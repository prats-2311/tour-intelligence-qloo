// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { OWNER_KEY } from "@/lib/tours/api";
import type { GatewayEvent } from "@/lib/qloo/types";
import { AppShell } from "./AppShell";

// Regression: auto-save lived outside the shell's ToastProvider, so it saved but the "Saved to My tours" toast never showed in the real app.
function Run() {
  const { run } = useTourBoard();
  return <button onClick={() => run(SAMPLE_BRIEF, { sample: false })}>live</button>;
}
async function* fakeStream(): AsyncGenerator<GatewayEvent> { for (const e of LUMEN_VALE_SAMPLE) yield e; }

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  localStorage.clear(); localStorage.setItem(OWNER_KEY, "tok");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "t-1", updatedAt: 1 }), { status: 201, headers: { "content-type": "application/json" } })));
  vi.spyOn(client, "streamTourBoard").mockImplementation(() => fakeStream());
});
afterEach(() => { cleanup(); resetPlaybooks(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AppShell mounts the auto-save inside its toast provider", () => {
  it("a finished live run shows the Saved to My tours toast", async () => {
    render(<MemoryRouter initialEntries={["/tours/board"]}><TourBoardProvider><AppShell><Run /></AppShell></TourBoardProvider></MemoryRouter>);
    act(() => screen.getByText("live").click());
    await waitFor(() => expect(screen.getByText("Saved to My tours")).toBeTruthy());
  });
});
