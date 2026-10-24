// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "@/lib/qloo/cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents, sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "@/lib/qloo/playbookReducer";
import { SAMPLE_TEXT } from "@/lib/qloo/labels";
import { buildTourBook } from "@/lib/qloo/tourBook";
import { CityChapter } from "./CityChapter";
import { MarketChapter } from "./MarketChapter";
import { ProvenanceAppendix } from "./ProvenanceAppendix";
import { SlopeChart } from "./SlopeChart";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const done = (id: string): PlaybookState => samplePlaybookEvents(id)!.reduce((s, event) => playbookReducer(s, { type: "event", event }), playbookReducer(initialPlaybook, { type: "start", source: "sample" }));
const ids = ["3530597", "3448439", "4005539", "3464975"];
const book = buildTourBook({
  brief: SAMPLE_BRIEF, artistName: "Lumen Vale", source: "sample", cities: SAMPLE_CITIES, shortlist: ids, accentOrder: SAMPLE_ACCENT_ORDER, boardLog: LUMEN_VALE_SAMPLE,
  playbooks: Object.fromEntries(ids.map((id) => [id, done(id)])), weeks: Object.fromEntries(ids.map((id) => [id, sampleThisWeek(id)!])),
});

describe("book components", () => {
  it("slope chart spells out the highlighted moves for screen readers", () => {
    render(<SlopeChart rows={book.market.slope} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")).toContain("Guadalajara 6th → 3rd");
    expect(img.getAttribute("aria-label")).toContain("Curitiba 8th → 4th");
  });
  it("slope chart footnotes unplaced cities and only keys what is drawn", () => {
    const { container, rerender } = render(<SlopeChart rows={book.market.slope} unplaced={["Oaxaca"]} />);
    expect(screen.getByText("Not scored: Qloo couldn't place Oaxaca")).toBeTruthy();
    expect(screen.getByText("Hidden goldmine that climbs")).toBeTruthy();
    rerender(<SlopeChart rows={book.market.slope.map((r) => ({ ...r, highlight: false }))} />);
    expect(screen.queryByText("Hidden goldmine that climbs")).toBeNull();
    expect(screen.queryByText(/Not scored/)).toBeNull();
    expect(screen.getByText("Other markets")).toBeTruthy();
    expect(container.querySelector("figcaption")).toBeTruthy();
  });
  it("an incomplete chapter shows its reason instead of empty sections", () => {
    render(<CityChapter chapter={{ ...book.chapters[0]!, status: "incomplete", incompleteReason: "Session limit reached", playbook: undefined, claims: null }} />);
    expect(screen.getByText("Playbook incomplete — Session limit reached")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sponsors" })).toBeNull();
  });
  it("a ready chapter reads as continuous sections ending with the claims badge", () => {
    render(<CityChapter chapter={book.chapters[2]!} />);
    expect(screen.getByRole("heading", { name: "Guadalajara", level: 2 })).toBeTruthy();
    for (const name of ["Sponsors", "Merch", "Promo zones", "Local moment", "Venue fit", "Co-billing", "Local acts", "This week"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeTruthy();
    }
    expect(screen.getByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getByText("7 verified · 2 removed")).toBeTruthy();
  });
  it("provenance appendix counts requests in its title", () => {
    render(<ProvenanceAppendix rows={book.provenance} />);
    expect(screen.getByRole("heading", { name: `Provenance · ${book.provenance.length} Qloo requests` })).toBeTruthy();
  });
  it("provenance shows plain names, result counts and a readable status, never raw ids or needs_input", () => {
    const rows = [
      { n: 1, tool: "qloo_recommend", name: "Sponsor recommendations", resultCount: 10, inputs: "Mexico City", status: "ok", cached: false, cacheKey: "00000000-aaaa-bbbb-cccc-000000000001", hash: "0000…01" },
      { n: 2, tool: "qloo_describe", name: "Artist lookup", resultCount: 0, inputs: "", status: "needs_input", cached: true, cacheKey: "00000000-aaaa-bbbb-cccc-000000000002", hash: "0000…02" },
    ];
    const { container } = render(<ProvenanceAppendix rows={rows} />);
    expect(screen.getByText("Sponsor recommendations")).toBeTruthy();
    expect(screen.getByText("10 results")).toBeTruthy();
    expect(screen.getByText("Needed more input (skipped)")).toBeTruthy();
    expect(container.textContent).not.toMatch(/needs_input|qloo_|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
  it("market chapter marks shortlisted rows with a gold edge element and keeps the integrity line", () => {
    const { container } = render(<MarketChapter market={book.market} />);
    expect(screen.getByRole("heading", { name: "Market selection", level: 2 })).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
    expect(container.querySelectorAll("table [data-shortlisted-edge]")).toHaveLength(4);
    // Below md the same rows render as a stacked list with its own gold rail.
    const stacked = screen.getByRole("list", { name: "Scored markets" });
    expect(stacked.querySelectorAll("li")).toHaveLength(10);
    expect(stacked.querySelectorAll("[data-shortlisted-edge]")).toHaveLength(4);
    expect(stacked.textContent).toMatch(/Heat \d+ · Act \d+ · Win \d+/);
    expect(screen.getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
  });
  it("labels every sample chapter and the appendix, and nothing in a live book", () => {
    const a = render(<CityChapter chapter={book.chapters[2]!} sample />);
    expect(a.getAllByText(SAMPLE_TEXT)).toHaveLength(1);
    a.unmount();
    const b = render(<ProvenanceAppendix rows={book.provenance} sample />);
    expect(b.getAllByText(SAMPLE_TEXT)).toHaveLength(1);
    b.unmount();
    const c = render(<><CityChapter chapter={book.chapters[2]!} /><ProvenanceAppendix rows={book.provenance} /></>);
    expect(c.queryByText(SAMPLE_TEXT)).toBeNull();
  });
  it("labels an incomplete sample chapter too", () => {
    render(<CityChapter sample chapter={{ ...book.chapters[0]!, status: "incomplete", incompleteReason: "x", playbook: undefined, claims: null }} />);
    expect(screen.getAllByText(SAMPLE_TEXT)).toHaveLength(1);
  });
  it("keys duplicate claim text by index so React does not warn", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const ch = book.chapters[2]!;
    const dup = { text: "Dup claim.", entities: [{ name: "Dup" }], numbers: [], evidence_refs: ["sponsors:0"] };
    const narrative = ch.playbook!.narrative;
    if (narrative?.status !== "ok") throw new Error("expected ok");
    const playbook = { ...ch.playbook!, narrative: { ...narrative, cards: { ...narrative.cards, sponsors: { verified: [dup, dup], removed: [] } } } };
    render(<CityChapter chapter={{ ...ch, playbook }} />);
    expect(screen.getAllByText("Dup claim.")).toHaveLength(2);
    expect(err.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  });
});
