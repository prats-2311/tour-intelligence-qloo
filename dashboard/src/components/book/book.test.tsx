// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "@/lib/qloo/cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents, sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "@/lib/qloo/playbookReducer";
import { buildTourBook } from "@/lib/qloo/tourBook";
import { CityChapter } from "./CityChapter";
import { MarketChapter } from "./MarketChapter";
import { ProvenanceAppendix } from "./ProvenanceAppendix";
import { SlopeChart } from "./SlopeChart";

afterEach(cleanup);

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
    expect(img.getAttribute("aria-label")).toContain("Curitiba 9th → 4th");
  });
  it("an incomplete chapter shows its reason instead of empty sections", () => {
    render(<CityChapter chapter={{ ...book.chapters[0]!, status: "incomplete", incompleteReason: "Session limit reached", playbook: undefined, claims: null }} />);
    expect(screen.getByText("Playbook incomplete — Session limit reached")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sponsors" })).toBeNull();
  });
  it("a ready chapter reads as continuous sections ending with the claims badge", () => {
    render(<CityChapter chapter={book.chapters[2]!} />);
    expect(screen.getByRole("heading", { name: "Guadalajara", level: 2 })).toBeTruthy();
    for (const name of ["Sponsors", "Merch", "Promo zones", "Local moment", "Venue fit", "Co-billing", "Talent", "This week"]) {
      expect(screen.getByRole("heading", { name, level: 3 })).toBeTruthy();
    }
    expect(screen.getByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    expect(screen.getByText("7 verified · 2 removed")).toBeTruthy();
  });
  it("provenance appendix counts requests in its title", () => {
    render(<ProvenanceAppendix rows={book.provenance} />);
    expect(screen.getByRole("heading", { name: `Provenance · ${book.provenance.length} Qloo requests` })).toBeTruthy();
  });
  it("market chapter marks shortlisted rows with a gold edge element and keeps the integrity line", () => {
    const { container } = render(<MarketChapter market={book.market} />);
    expect(screen.getByRole("heading", { name: "Market selection", level: 2 })).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
    expect(container.querySelectorAll("[data-shortlisted-edge]")).toHaveLength(4);
    expect(screen.getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
  });
});
