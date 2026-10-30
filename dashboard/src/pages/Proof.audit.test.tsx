// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ProofView } from "./Proof";
import v3Backtest from "@/test/fixtures/backtest.v3.synthetic.json";
import syntheticBacktest from "@/test/fixtures/backtest.synthetic.json";
import { parseBacktest } from "@/lib/qloo/backtest";
import { buildScoreboard } from "@/lib/qloo/proofScoreboard";
import type { ReactNode } from "react";

afterEach(() => cleanup());
const view = (raw: unknown, live?: ReactNode) => render(<MemoryRouter><ProofView data={parseBacktest(raw)} live={live} /></MemoryRouter>);
const before = (x: Node, y: Node) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
const v3Of = () => { const b = parseBacktest(v3Backtest); if (b.status !== "complete" || !b.proofV3) throw new Error("fixture"); return b.proofV3; };

describe("Proof scoreboard (audit C 1)", () => {
  it("sits directly under the h1 with two columns, derived lines, anchors and the one-line meaning", () => {
    view(v3Backtest);
    const h1 = screen.getByRole("heading", { level: 1 });
    const board = screen.getByRole("region", { name: "At a glance" });
    expect(before(h1, board)).toBe(true);
    const win = within(board).getByRole("heading", { name: "Where Qloo wins" });
    const llm = within(board).getByRole("heading", { name: "Where a plain LLM wins" });
    expect(win).toBeTruthy(); expect(llm).toBeTruthy();
    const s = buildScoreboard(v3Of());
    for (const e of [...s.qloo, ...s.llm]) {
      expect(within(board).getByText(e.text)).toBeTruthy();
      expect(document.getElementById(e.anchor)).not.toBeNull();
    }
    const links = within(board).getAllByRole("link");
    expect(links.length).toBe(s.qloo.length + s.llm.length);
    expect(links.every((l) => /^#proof-/.test(l.getAttribute("href") ?? ""))).toBe(true);
    expect(within(board).getByText("What this means")).toBeTruthy();
    expect(within(board).getByText("Qloo adds taste data an LLM can't produce or verify; we don't claim it picks cities better than an LLM.")).toBeTruthy();
  });
  it("puts the scoreboard before the checkers and the checkers before the tests; no empty Limits heading", () => {
    view(v3Backtest);
    const board = screen.getByRole("region", { name: "At a glance" });
    const secs = screen.getAllByRole("region").filter((r) => r.getAttribute("data-testid") === "proof-v3-test");
    expect(secs.map((x) => x.getAttribute("data-test-id"))).toEqual(["catch", "B", "C", "A", "F"]);
    const checkers = document.querySelector('[data-testid="proof-checkers"]');
    if (checkers) { expect(before(board, checkers)).toBe(true); expect(before(checkers, secs[1]!)).toBe(true); }
    expect(before(board, secs[0]!)).toBe(true);
    expect(screen.queryByRole("heading", { name: /^Limits: where Qloo-backed ranking lost/ })).toBeNull();
  });
  it("the live panel slot comes after the scoreboard, never above the h1", () => {
    view(v3Backtest, <div data-testid="live-slot" />);
    const slot = screen.getByTestId("live-slot");
    expect(before(screen.getByRole("region", { name: "At a glance" }), slot)).toBe(true);
    expect(before(slot, screen.getAllByRole("region").find((r) => r.getAttribute("data-testid") === "proof-v3-test")!)).toBe(true);
  });
});

describe("Proof density and glossary (audit C 2)", () => {
  it("has a closed 'How to read this' glossary with the seven terms", () => {
    view(v3Backtest);
    const d = screen.getByText("How to read this").closest("details")!;
    expect(d.open).toBe(false);
    for (const term of ["MRR", "R-precision", "winnability", "sign test", "p", "pairs", "ties"]) expect(within(d).getByText(term, { selector: "dt" })).toBeTruthy();
  });
  it("collapses per-case slug claims into a closed disclosure and keeps headline claims visible", () => {
    view(v3Backtest);
    const a = screen.getByRole("region", { name: "Test A: choosing the cities a tour played" });
    const slugLine = within(a).getByText("The generic LLM beat winnability for Synthetic Quartet.");
    const det = slugLine.closest("details")!;
    expect(det).not.toBeNull();
    expect(det.open).toBe(false);
    expect(det.querySelector("summary")!.textContent).toMatch(/^Per-case details \(\d+\)$/);
    const headline = within(a).getByText(/Test A \(city ranking\) covers/);
    expect(headline.closest("details")).toBeNull();
  });
  it("legacy runs: 'Every case (N)' is a closed disclosure and each case is rendered once", () => {
    view(syntheticBacktest);
    const sum = screen.getAllByText(/^Every case \(\d+\)$/)[0]!;
    const d = sum.closest("details")!;
    expect(d.open).toBe(false);
    const articles = within(d).getAllByRole("article");
    const names = articles.map((a) => a.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
    const all = screen.getAllByRole("article").filter((a) => !d.contains(a) && !a.closest("details"));
    expect(all).toEqual([]);
  });
});

describe("Proof tables (audit C 4, 10)", () => {
  it("scroll inside a focusable named region", () => {
    view(v3Backtest);
    const c = screen.getByRole("region", { name: "Test C: do the names exist in the city?" });
    const table = within(c).getAllByRole("table")[0]!;
    const scroller = table.closest('[role="region"][tabindex="0"]') as HTMLElement;
    expect(scroller).not.toBeNull();
    expect(scroller.getAttribute("aria-label")).toMatch(/scrolls sideways/);
    expect(scroller.className).toContain("overflow-x-auto");
  });
  it("exploratory subset: text columns left, number columns right, header follows", () => {
    view(v3Backtest);
    const t = screen.getByRole("table", { name: /Gemini \+ Qloo combined.*: Arm/ });
    const heads = within(t).getAllByRole("columnheader");
    expect(heads[1]!.className).not.toContain("text-right"); // Arm (text)
    expect(heads[2]!.className).toContain("text-right"); // Mean (numbers)
    const row = within(t).getAllByRole("row")[1]!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]!.className).not.toContain("text-right");
    expect(cells[1]!.className).toContain("text-right");
  });
});

describe("Proof amendments (audit C 9)", () => {
  const withAmendments = () => parseBacktest({ ...v3Backtest, proofV3: { ...v3Of(), amendments: [
    { n: 7, commit: "02de5dff6ac99c65885d28aff70667493b42ca8f", summary: "every test so far compares Qloo *instead of* an LLM." },
    { n: 10, commit: "9cf5b7688832808939292bf2a5e2a21aacc19c71", summary: "`/proof` publishes one checker test." },
  ] } });
  it("renders emphasis and code, never raw markers, and links each commit to the public repo", () => {
    render(<MemoryRouter><ProofView data={withAmendments()} /></MemoryRouter>);
    const sec = screen.getByRole("region", { name: "Amendments" });
    expect(sec.textContent).not.toMatch(/[*`]/);
    expect(sec.querySelector("em")!.textContent).toBe("instead of");
    expect(sec.querySelector("code")!.textContent).toBe("/proof");
    const link = within(sec).getByRole("link", { name: /Amendment 7 commit 02de5df/ });
    expect(link.getAttribute("href")).toBe("https://github.com/prats-2311/tour-intelligence-qloo/commit/02de5dff6ac99c65885d28aff70667493b42ca8f");
  });
});
