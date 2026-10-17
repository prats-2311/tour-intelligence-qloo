// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProofRoute, { ProofView } from "./Proof";
import { parseBacktest } from "@/lib/qloo/backtest";
import { oneRunFixture, run1Fixture, run2Fixture, twoRunsFixture } from "@/lib/qloo/fixtures/backtestTestFixture";

const view = (raw: unknown) => render(<MemoryRouter><ProofView data={parseBacktest(raw)} /></MemoryRouter>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const REASON = "Run 1 asked Qloo for artists the headliner's fans like in that city, which returns global taste neighbours, not local acts. We changed the recipe to rank the city's own popular artists by taste fit, then tested it on new cases reviewed after the change.";

describe("Proof", () => {
  it("leads with the promoter's question and the latest run's hit rates", () => {
    view(twoRunsFixture);
    expect(screen.getByRole("heading", { level: 1, name: "Would it have found what the real tour used?" })).toBeTruthy();
    expect(screen.getByText("PROOF · ACTIVATION BACKTEST")).toBeTruthy();
    expect(screen.getByText(/We took 2 real city activations from 2021–2026 tours/)).toBeTruthy();
    const pb = screen.getByRole("region", { name: "Qloo playbook" });
    expect(within(pb).getByText("2 of 2 in the top 10 · 100%")).toBeTruthy();
    expect(within(pb).getByText("2 of 2 in the top 20 · 100%")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "City popularity (Qloo, no artist)" })).getByText("0 of 2 in the top 10 · 0%")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Generic LLM (no Qloo)" })).toBeTruthy();
  });
  it("shows the methodNote of the headline run", () => {
    view(twoRunsFixture);
    expect(screen.getByText(run2Fixture.methodNote!)).toBeTruthy();
  });
  it("with two runs, How we got here shows run 1's numbers, losses and the verbatim reason", () => {
    view(twoRunsFixture);
    const how = screen.getByRole("region", { name: "How we got here" });
    expect(within(how).getByText(REASON)).toBeTruthy();
    expect(within(how).getByText(run1Fixture.methodNote!)).toBeTruthy();
    expect(within(within(how).getByRole("region", { name: "Qloo playbook (run 1)" })).getByText("2 of 3 in the top 10 · 67%")).toBeTruthy();
    expect(within(how).getByText("Beta Apparel")).toBeTruthy();
  });
  it("with one run there is no How we got here", () => {
    view(oneRunFixture);
    expect(screen.queryByText("How we got here")).toBeNull();
    expect(screen.queryByText(/Run 1 asked Qloo/)).toBeNull();
    expect(screen.getByText("2 of 3 in the top 10 · 67%")).toBeTruthy();
  });
  it("shows unavailable answers as no answer, never as a miss", () => {
    view(oneRunFixture);
    const card = screen.getAllByRole("article", { name: /Beta Apparel/ }).at(-1)!;
    const llm = within(card).getByText("Generic LLM (no Qloo)").nextElementSibling!;
    expect(llm.textContent).toBe("no answer");
    expect(within(card).getByText("#3")).toBeTruthy();
    expect(within(card).getByText("not in top 20")).toBeTruthy();
  });
  it("notes when the taste ranking was unavailable next to the rank", () => {
    view(oneRunFixture);
    const card = screen.getByRole("article", { name: /Very Long Named/ });
    expect(within(card).getByText("#9")).toBeTruthy();
    expect(within(card).getByText("taste ranking unavailable")).toBeTruthy();
  });
  it("puts the lost case under Where we lost", () => {
    view(oneRunFixture);
    const lost = screen.getByRole("region", { name: "Where we lost" });
    expect(within(lost).getByText("Beta Apparel")).toBeTruthy();
  });
  it("says so when nothing was lost", () => {
    view({ runs: [{ ...run1Fixture, lost: [] }] });
    expect(screen.getByText("No case where a baseline ranked the real entity above the playbook.")).toBeTruthy();
  });
  it("links sources safely by hostname and flags unresolved entities", () => {
    view(oneRunFixture);
    const links = screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("https://"));
    expect(links.length).toBe(7);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getAllByText("www.example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Not found in Qloo search — matched by name")).toBeTruthy();
  });
  it("lists the limitations including leakage", () => {
    view(oneRunFixture);
    expect(screen.getByText(/post-hoc leakage/)).toBeTruthy();
    expect(screen.getByText("Small sample: 3 cases, each human-reviewed against its sources.")).toBeTruthy();
    expect(screen.getByText("The generic LLM had no web search.")).toBeTruthy();
  });
  it("footer names the run date and model", () => {
    view(twoRunsFixture);
    expect(screen.getByText("Run 2026-10-17 · model gemini-test · reproduce with the steps in backtest/README.md")).toBeTruthy();
  });
  it("pending state shows no numbers", () => {
    view({ runs: [] });
    expect(screen.getByRole("heading", { level: 1, name: "Would it have found what the real tour used?" })).toBeTruthy();
    expect(screen.getByText("The backtest has not been published yet.")).toBeTruthy();
    expect(screen.queryByText(/of \d+ in the top/)).toBeNull();
    expect(screen.queryByText("How we got here")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d/);
  });
  it("the default route renders the committed (pending) fixture", () => {
    render(<MemoryRouter><ProofRoute /></MemoryRouter>);
    expect(screen.getByText("The backtest has not been published yet.")).toBeTruthy();
  });
  it("makes no network requests", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    view(twoRunsFixture);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
