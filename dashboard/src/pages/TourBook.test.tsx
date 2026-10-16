// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "@/lib/qloo/client";
import { SAMPLE_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { TourBoardProvider, useTourBoard } from "@/lib/qloo/TourBoardProvider";
import TourBook from "./TourBook";

// Four sample playbooks are prepared one after another at the page's 10 ms replay pace.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  resetPlaybooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// jsdom's Blob has no text().
const readBlob = (b: Blob) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b); });

function RunNoWindow() {
  const { run } = useTourBoard();
  useEffect(() => { run({ ...SAMPLE_BRIEF, dateWindow: undefined }, { sample: true }); }, [run]);
  return null;
}

const renderAt = (url: string, extra?: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TourBoardProvider sampleDelayMs={0}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tours/book" element={<TourBook />} />
            <Route path="/tours/board" element={<p>board</p>} />
          </Routes>
          {extra}
        </MemoryRouter>
      </TourBoardProvider>
    </QueryClientProvider>,
  );

describe("TourBook", () => {
  it("prepares the sample shortlist and renders cover, market chapter and four city chapters", async () => {
    renderAt("/tours/book?sample=1");
    expect(await screen.findByRole("heading", { name: "Market selection" })).toBeTruthy();
    for (const name of ["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]) expect(await screen.findByRole("heading", { name, level: 2 })).toBeTruthy();
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lumen Vale", level: 1 })).toBeTruthy();
    expect(screen.getByText("Don't just find your fans. Win their city.")).toBeTruthy();
  });
  it("Download PDF prints and Calendar downloads an .ics named after the artist", async () => {
    const print = vi.fn(); vi.stubGlobal("print", print);
    const created: Blob[] = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: (b: Blob) => { created.push(b); return "blob:x"; }, revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("lumen-vale-holds.ics"); });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(click).toHaveBeenCalled();
    expect(await readBlob(created[0]!)).toContain("SUMMARY:Hold — Guadalajara\\, MX");
  });
  it("Share uses the Web Share API when available, else copies the link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Lumen Vale"), url: location.href }));
    cleanup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalled();
  });
  it("loads playbooks one at a time", async () => {
    let active = 0, maxActive = 0;
    const real = client.streamCityPlaybook;
    vi.spyOn(client, "streamCityPlaybook").mockImplementation((q, o) => (async function* () {
      active += 1; maxActive = Math.max(maxActive, active);
      try { yield* real(q, o); } finally { active -= 1; }
    })());
    renderAt("/tours/book?sample=1");
    await screen.findByRole("heading", { name: "Curitiba", level: 2 });
    expect(maxActive).toBe(1);
  });
  it("shows an honest state on a deep link without a board", async () => {
    renderAt("/tours/book");
    expect(await screen.findByText("Build a tour from a Tour Board first")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Tour Board" }).getAttribute("href")).toBe("/tours/board");
  });
  it("disables Calendar without a date window", async () => {
    renderAt("/tours/book", <RunNoWindow />);
    expect(await screen.findByRole("button", { name: "Calendar" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Add a date window to export holds")).toBeTruthy();
  });
  it("Chapters opens the index sheet and lists every chapter with its verdict", async () => {
    renderAt("/tours/book?sample=1");
    fireEvent.click(await screen.findByRole("button", { name: "Chapters" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters" });
    expect(dialog.textContent).toContain("Market selection");
    expect(dialog.textContent).toContain("Guadalajara");
    expect(dialog.textContent).toContain("Hidden goldmine");
    expect(dialog.textContent).toContain("Provenance");
  });
});
