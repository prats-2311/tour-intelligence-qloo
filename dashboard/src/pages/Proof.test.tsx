// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProofRoute, { ProofView } from "./Proof";
import syntheticBacktest from "@/test/fixtures/backtest.synthetic.json";
import v3Backtest from "@/test/fixtures/backtest.v3.synthetic.json";
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

describe("Proof v3", () => {
  const INTRO = "We pre-registered every test before running it and publish all of it, including where Qloo-backed ranking lost.";
  const sections = () => screen.getAllByRole("region").filter((r) => r.getAttribute("data-testid") === "proof-v3-test");
  it("opens with the verbatim intro and a link to the protocol on GitHub", () => {
    view(v3Backtest);
    expect(screen.getByText(INTRO)).toBeTruthy();
    const link = screen.getByRole("link", { name: /protocol and its amendments/i });
    expect(link.getAttribute("href")).toBe("https://github.com/prats-2311/tour-intelligence-qloo/blob/master/docs/qloo/proof-v3-protocol.md");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("renders tests in the order catch, B, C, A", () => {
    view(v3Backtest);
    expect(sections().map((s) => s.getAttribute("data-test-id"))).toEqual(["catch", "B", "C", "A"]);
  });
  it("each test shows title, question, status, an arm table, verbatim claims and limits", () => {
    view(v3Backtest);
    const a = screen.getByRole("region", { name: "Test A: choosing the cities a tour played" });
    expect(within(a).getByText("Does winnability pick the cities a tour actually played better than fan heat alone, a generic LLM, or population?")).toBeTruthy();
    expect(within(a).getByText("Complete: 3 of a planned 4 artists scored")).toBeTruthy();
    const arms = within(a).getByRole("table", { name: /Mean R-precision/ });
    expect(within(arms).getByText("Chance level")).toBeTruthy();
    expect(within(a).getByText("The generic LLM beat winnability for Synthetic Quartet.")).toBeTruthy();
    expect(within(a).getByText(/Sample size: a few artists is a small sample/)).toBeTruthy();
    expect(within(a).getByText(/Batch 2/)).toBeTruthy();
  });
  it("per artist/case disclosure lists every unit, closed by default", () => {
    view(v3Backtest);
    const a = screen.getByRole("region", { name: "Test A: choosing the cities a tour played" });
    const d = within(a).getByText("Per artist").closest("details")!;
    expect(d.open).toBe(false);
    expect(within(d).getAllByRole("row")).toHaveLength(1 + 3);
    expect(within(d).getByText("no answer")).toBeTruthy();
    const b = screen.getByRole("region", { name: "Test B: picking the real activation among 10 candidates" });
    expect(within(within(b).getByText("Per case").closest("details")!).getByText("synth-a")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /Claim checker/ })).queryByText(/^Per /)).toBeNull();
  });
  it("tables scroll inside their own focusable container", () => {
    view(v3Backtest);
    const c = screen.getByRole("region", { name: "Test C: do the names exist in the city?" });
    const scroller = within(c).getByRole("table", { name: /Venues|Playbook/ }).parentElement!;
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.getAttribute("tabindex")).toBe("0");
  });
  it("keeps the earlier runs below, under Earlier runs, and the amendments listed", () => {
    view(v3Backtest);
    const earlier = screen.getByRole("region", { name: "Earlier runs" });
    expect(within(earlier).getByText("What this shows")).toBeTruthy();
    expect(within(earlier).getByText("Run 2026-10-17 · model gemini-3.8-flash · reproduce with the steps in backtest/README.md")).toBeTruthy();
    const order = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(order(sections().at(-1)!, earlier)).toBe(true);
    expect(screen.getByText(/The first eligible list had two design flaws/)).toBeTruthy();
  });
  it("Test C absent from the data means no Test C section; present means a section with no extra code", () => {
    const v3 = (v3Backtest as { proofV3: { tests: Array<{ id: string }> } }).proofV3;
    view({ ...v3Backtest, proofV3: { ...v3, tests: v3.tests.filter((t) => t.id !== "C") } });
    expect(sections().map((s) => s.getAttribute("data-test-id"))).toEqual(["catch", "B", "A"]);
  });
  it("works with v3 alone (no earlier runs) and never says winnability is better", () => {
    const { container } = view({ proofV3: (v3Backtest as { proofV3: unknown }).proofV3 });
    expect(screen.queryByText("Earlier runs")).toBeNull();
    const text = (container.textContent ?? "").toLowerCase();
    for (const w of ["winnability beats", "better ranking", "outperform", "superior"]) expect(text).not.toContain(w);
  });
  it("headings never skip a level and no network is used", () => {
    const spy = vi.fn(); vi.stubGlobal("fetch", spy);
    view(v3Backtest);
    const levels = screen.getAllByRole("heading").map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => { if (i > 0) expect(l).toBeLessThanOrEqual(levels[i - 1]! + 1); });
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
