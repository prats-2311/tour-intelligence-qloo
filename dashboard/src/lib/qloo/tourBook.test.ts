import { describe, expect, it } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "./cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { samplePlaybookEvents, sampleThisWeek } from "./fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "./playbookReducer";
import { buildTourBook, seasonLabel } from "./tourBook";

const done = (id: string): PlaybookState => samplePlaybookEvents(id)!.reduce((s, event) => playbookReducer(s, { type: "event", event }), playbookReducer(initialPlaybook, { type: "start", source: "sample" }));
const shortlist = ["3530597", "3448439", "4005539", "3464975"];
const base = { brief: SAMPLE_BRIEF, artistName: "Lumen Vale", source: "sample" as const, cities: SAMPLE_CITIES, shortlist, accentOrder: SAMPLE_ACCENT_ORDER, boardLog: LUMEN_VALE_SAMPLE };

describe("buildTourBook", () => {
  const book = buildTourBook({ ...base, playbooks: Object.fromEntries(shortlist.map((id) => [id, done(id)])), weeks: Object.fromEntries(shortlist.map((id) => [id, sampleThisWeek(id)!])) });
  it("titles the book from the brief", () => {
    expect(book.title).toBe("Lumen Vale: Mexico, Brazil, United States");
    expect(book.subtitle).toBe("Spring 2027");
  });
  it("market chapter lists every scored city and marks the shortlist", () => {
    expect(book.market.rows).toHaveLength(10);
    expect([...book.market.shortlisted]).toEqual(shortlist);
  });
  it("slope chart highlights hidden goldmines that climb (Guadalajara 6 → 3, Curitiba 9 → 4)", () => {
    const gdl = book.market.slope.find((s) => s.name === "Guadalajara")!;
    expect(gdl).toMatchObject({ densityRank: 6, winRank: 3, highlight: true });
    expect(book.market.slope.find((s) => s.name === "Curitiba")).toMatchObject({ densityRank: 9, winRank: 4, highlight: true });
    expect(book.market.slope.some((s) => s.name === "Belo Horizonte")).toBe(false);
  });
  it("chapters follow winnability order with accents and claim totals", () => {
    expect(book.chapters.map((c) => c.city.name)).toEqual(["Mexico City", "São Paulo", "Guadalajara", "Curitiba"]);
    const gdl = book.chapters[2]!;
    expect(gdl.accent).toBe("#ff00aa");
    expect(gdl.claims).toEqual({ verified: 7, removed: 2 });
    expect(gdl.advance.find((r) => r.label === "Best room")?.value).toBe("C3 Stage");
    expect(gdl.advance.find((r) => r.label === "Merch drop")?.value).toBe("Jacaranda season");
  });
  it("provenance lists each Qloo request once with a truncated hash", () => {
    const keys = book.provenance.map((r) => r.hash);
    expect(new Set(keys).size).toBe(keys.length);
    expect(book.provenance[0]!.hash).toMatch(/^.{4}….{2}$/);
    expect(book.provenance.every((r) => r.n >= 1)).toBe(true);
  });
  it("marks chapters incomplete with the reason when a playbook failed or is missing", () => {
    const failed = playbookReducer(playbookReducer(initialPlaybook, { type: "start", source: "live" }), { type: "event", event: { type: "error", code: "BUDGET", message: "x" } });
    const b = buildTourBook({ ...base, playbooks: { "3530597": failed }, weeks: {} });
    expect(b.chapters[0]).toMatchObject({ status: "incomplete", incompleteReason: "Session limit reached", claims: null });
    expect(b.chapters[1]).toMatchObject({ status: "incomplete", incompleteReason: "Not loaded" });
  });
  it("an empty shortlist yields a book with the market chapter only", () => {
    expect(buildTourBook({ ...base, shortlist: [], playbooks: {}, weeks: {} }).chapters).toEqual([]);
  });
});

describe("seasonLabel", () => {
  it("labels by the start month", () => {
    expect(seasonLabel({ start: "2027-03-12", end: "2027-04-18" })).toBe("Spring 2027");
    expect(seasonLabel({ start: "2026-12-05", end: "2027-01-10" })).toBe("Winter 2027");
    expect(seasonLabel(undefined)).toBe("");
  });
});
