// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProofRoute, { ProofView } from "./Proof";
import syntheticBacktest from "@/test/fixtures/backtest.synthetic.json";
import { getBacktest, parseBacktest, setBacktest } from "@/lib/qloo/backtest";
import { oneRunFixture, run1Fixture, run2Fixture, twoRunsFixture } from "@/lib/qloo/fixtures/backtestTestFixture";

const view = (raw: unknown) => render(<MemoryRouter><ProofView data={parseBacktest(raw)} /></MemoryRouter>);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const REASON = "Run 1 asked Qloo for artists the headliner's fans like in that city, which returns global taste neighbours. Run 2 ranked the city's own popular artists by taste fit and was judged on fresh cases reviewed after the change; it did no better, because Qloo's city-popularity list misses the most famous national acts.";
const WHAT = "For naming the specific famous local guest or sponsor a real tour used, a general-purpose LLM did better than Qloo's taste graph in both runs. Qloo's recommendations reflect what over-indexes with an audience in a city, not who is most famous there — that is world knowledge. So the playbook now asks an LLM for local candidates and uses Qloo to check each one exists and to rank it by taste fit. We have not yet tested that change on new cases, so we make no claim about it here.";

describe("Proof", () => {
  it("leads with the promoter's question and the latest run's hit rates", () => {
    view(twoRunsFixture);
    expect(screen.getByRole("heading", { level: 1, name: "Would it have found what the real tour used?" })).toBeTruthy();
    expect(screen.getByText("PROOF · ACTIVATION BACKTEST")).toBeTruthy();
    expect(screen.getByText(/We took 2 real city activations from 2022–2024 tours \(a sponsor or a local act\)/)).toBeTruthy();
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
  it("What this shows sits under the headline numbers, before Where we lost, only with 2+ runs", () => {
    view(twoRunsFixture);
    const what = screen.getByRole("region", { name: "What this shows" });
    expect(within(what).getByText(WHAT)).toBeTruthy();
    const order = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(order(screen.getByRole("region", { name: "Qloo playbook" }), what)).toBe(true);
    expect(order(what, screen.getByRole("region", { name: "Where we lost" }))).toBe(true);
    cleanup();
    view(oneRunFixture);
    expect(screen.queryByText("What this shows")).toBeNull();
  });
  it("limitation 4 follows the shown run's method", () => {
    view(oneRunFixture);
    expect(screen.getByText("The playbook column is the exact Qloo request the City Playbook makes, with the list widened to 20.")).toBeTruthy();
    cleanup();
    view(twoRunsFixture);
    expect(screen.getByText("For local acts, the playbook column ranks the city's 10 most popular artists by taste fit (Qloo rank); for brands it is the exact recommend request the City Playbook makes, widened to 20.")).toBeTruthy();
    expect(screen.queryByText(/exact Qloo request the City Playbook makes, with/)).toBeNull();
  });
  it("a run whose lost id has no case is not shown (no false all-clear)", () => {
    expect(parseBacktest({ runs: [{ ...run1Fixture, lost: ["ghost"] }] })).toEqual({ status: "pending" });
    view({ runs: [{ ...run1Fixture, lost: ["ghost"] }] });
    expect(screen.queryByText(/No case where a baseline/)).toBeNull();
    expect(screen.getByText("The backtest has not been published yet.")).toBeTruthy();
  });
  it("headings never skip a level", () => {
    view(twoRunsFixture);
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
    levels.forEach((l, i) => { if (i > 0) expect(l).toBeLessThanOrEqual(levels[i - 1]! + 1); });
  });
  it("long names and source links carry wrapping classes", () => {
    view(oneRunFixture);
    const name = screen.getAllByText(/Very Long Named Local Ensemble/)[0]!;
    expect(name.className).toContain("break-words");
    expect(screen.getByText("a-very-long-subdomain.example-news-site.com").className).toContain("break-all");
  });
  it("the gold accent goes to the method with the highest top-10 hit count, not always the playbook", () => {
    setBacktest(syntheticBacktest);
    render(<MemoryRouter><ProofView data={getBacktest()!} /></MemoryRouter>);
    const llm = screen.getByRole("region", { name: "Generic LLM (no Qloo)" });
    const pb = screen.getByRole("region", { name: "Qloo playbook" });
    expect(llm.className).toContain("border-gold");
    expect(pb.className).not.toContain("border-gold");
    cleanup();
    view(twoRunsFixture); // playbook leads here
    expect(screen.getByRole("region", { name: "Qloo playbook" }).className).toContain("border-gold");
    expect(screen.getByRole("region", { name: "Generic LLM (no Qloo)" }).className).not.toContain("border-gold");
  });
  it("the recorded runs (synthetic fixture, same shape): two runs, headline is run 2's real numbers, no winning language", () => {
    setBacktest(syntheticBacktest);
    const BACKTEST = getBacktest()!;
    const { container } = render(<MemoryRouter><ProofView data={BACKTEST} /></MemoryRouter>);
    expect(BACKTEST.runs.length).toBe(2);
    const latest = BACKTEST.runs[BACKTEST.runs.length - 1]!.summary; // the headline is the latest run; expected text comes from the fixture
    const expected = (m: "qloo_playbook" | "llm_only") => `${latest[m].hit10} of ${latest[m].scored} in the top 10 · ${Math.round((100 * latest[m].hit10) / latest[m].scored)}%`;
    expect(within(screen.getByRole("region", { name: "Qloo playbook" })).getByText(expected("qloo_playbook"))).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Generic LLM (no Qloo)" })).getByText(expected("llm_only"))).toBeTruthy();
    expect(screen.getByText(/a local act on the bill\)/)).toBeTruthy();
    expect(screen.getByText(WHAT)).toBeTruthy();
    expect(screen.getByText(REASON)).toBeTruthy();
    const text = (container.textContent ?? "").toLowerCase();
    for (const w of ["beat", "outperform", "win"]) expect(text).not.toContain(w);
  });
  it("pending state shows no numbers", () => {
    view({ runs: [] });
    expect(screen.getByRole("heading", { level: 1, name: "Would it have found what the real tour used?" })).toBeTruthy();
    expect(screen.getByText("The backtest has not been published yet.")).toBeTruthy();
    expect(screen.queryByText(/of \d+ in the top/)).toBeNull();
    expect(screen.queryByText("How we got here")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d/);
  });
  it("the default route renders the committed runs", () => {
    render(<MemoryRouter><ProofRoute /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 2, name: "What this shows" })).toBeTruthy();
  });
  it("makes no network requests", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    view(twoRunsFixture);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("without a loaded backtest the route says so and offers Retry, which reloads", async () => {
    setBacktest(null);
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => (String(url).endsWith("/backtest") ? new Response(JSON.stringify(syntheticBacktest), { status: 200 }) : new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", fetchImpl);
    render(<MemoryRouter><ProofRoute /></MemoryRouter>);
    expect(screen.getByText("Proof results are unavailable right now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("What this shows")).toBeTruthy());
    expect(getBacktest()).not.toBeNull();
    setBacktest(null);
    vi.unstubAllGlobals();
  });
});
