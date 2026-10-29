import { describe, expect, it } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "./cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "./fixtures/lumenVale";
import { samplePlaybookEvents, sampleThisWeek } from "./fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "./playbookReducer";
import fixture from "@/test/fixtures/showcase.synthetic.json";
import { parseShowcase, showcaseCities } from "./showcase";
import { buildTourBook, campaignTitle, seasonLabel } from "./tourBook";

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
  it("slope chart highlights hidden goldmines that climb (Guadalajara 6 → 3, Curitiba 8 → 4; ranks cover scored cities only)", () => {
    const gdl = book.market.slope.find((s) => s.name === "Guadalajara")!;
    expect(gdl).toMatchObject({ densityRank: 6, winRank: 3, highlight: true });
    expect(book.market.slope.find((s) => s.name === "Curitiba")).toMatchObject({ densityRank: 8, winRank: 4, highlight: true });
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
  it("chapter claim totals skip claims that name a do-not-book act", () => {
    const pb = done("4005539");
    if (pb.narrative?.status !== "ok") throw new Error("fixture narrative should be ok");
    const kind = Object.keys(pb.narrative.cards)[0] as "sponsors";
    const cc = pb.narrative.cards[kind]!;
    const extra = { text: "Ariel Pink draws the same fans.", entities: [], numbers: [], evidence_refs: [] };
    const hidden = { ...pb, narrative: { ...pb.narrative, cards: { ...pb.narrative.cards, [kind]: { ...cc, verified: [...cc.verified, extra] } } } };
    const chapter = (p: PlaybookState) => buildTourBook({ ...base, playbooks: Object.fromEntries(shortlist.map((id) => [id, id === "4005539" ? p : done(id)])), weeks: {} }).chapters[2]!.claims;
    expect(chapter(hidden)).toEqual(chapter(pb));
  });
  it("the advance sheet has a This week tile only when the week has something to say", () => {
    const week = sampleThisWeek("4005539")!;
    const withWeek = (w: typeof week | undefined) => buildTourBook({ ...base, playbooks: Object.fromEntries(shortlist.map((id) => [id, done(id)])), weeks: Object.fromEntries(shortlist.map((id) => [id, w])) });
    const labels = (b: ReturnType<typeof withWeek>) => b.chapters[2]!.advance.map((r) => r.label);
    expect(labels(book)).toContain("This week");
    if (week.status !== "ok") throw new Error("fixture week should be ok");
    expect(labels(withWeek({ ...week, summarised: true, items: [] }))).not.toContain("This week");
    expect(labels(withWeek({ ...week, summarised: false, items: [], citations: [] }))).not.toContain("This week");
    expect(labels(withWeek(undefined))).not.toContain("This week");
    expect(labels(withWeek({ status: "unavailable", message: "Live web context unavailable" } as never))).toContain("This week");
  });
  it("provenance lists each Qloo request once with a truncated hash", () => {
    const keys = book.provenance.map((r) => r.cacheKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(book.provenance.every((r) => /^.{4}….{2}$/.test(r.hash))).toBe(true);
    expect(book.provenance.every((r) => r.n >= 1)).toBe(true);
  });
  it("provenance rows carry a plain tool name and the result count, and no raw ids", () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
    expect(book.provenance.length).toBeGreaterThan(0);
    for (const r of book.provenance) {
      expect(r.name).not.toMatch(/^qloo_/);
      expect(r.name.length).toBeGreaterThan(3);
      expect(typeof r.resultCount).toBe("number");
      expect(r.inputs).not.toMatch(uuid);
    }
    expect(book.provenance.some((r) => r.name === "Sponsor recommendations")).toBe(true);
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

describe("slope ranks", () => {
  const cities = showcaseCities(parseShowcase(fixture));
  const b = buildTourBook({ ...base, cities, shortlist: [], playbooks: {}, weeks: {} });
  const both = cities.filter((c) => c.winnability.value !== null && c.fanHeat.value !== null);
  it("includes every scored city that has both scores, with ranks inside 1..n so no line leaves the frame", () => {
    expect(b.market.slope.map((s) => s.id).sort()).toEqual(both.map((c) => c.id).sort());
    for (const s of b.market.slope) {
      expect(s.densityRank).toBeGreaterThanOrEqual(1);
      expect(s.densityRank).toBeLessThanOrEqual(both.length);
      expect(s.winRank).toBeLessThanOrEqual(both.length);
    }
    expect(new Set(b.market.slope.map((s) => s.densityRank)).size).toBe(both.length);
  });
  it("lists cities Qloo could not place so the chart can footnote them, and leaves them out of the lines", () => {
    const unplaced = cities.filter((c) => c.insufficientReason === "location_unresolved");
    expect(unplaced.length).toBeGreaterThan(0);
    expect(b.market.unplaced).toEqual(unplaced.map((c) => c.name));
    for (const c of unplaced) expect(b.market.slope.some((s) => s.id === c.id)).toBe(false);
  });
});

describe("seasonLabel", () => {
  it("labels by the start month", () => {
    expect(seasonLabel({ start: "2027-03-12", end: "2027-04-18" })).toBe("Spring 2027");
    expect(seasonLabel({ start: "2026-12-05", end: "2027-01-10" })).toBe("Winter 2027");
    expect(seasonLabel(undefined)).toBe("");
  });
});

describe("campaignTitle", () => {
  it("joins artist and regions", () => {
    expect(campaignTitle("Lumen Vale", ["Mexico", "Brazil"])).toBe("Lumen Vale — Mexico, Brazil");
  });
  it("never exceeds the API's 200-character cap and marks the cut", () => {
    const t = campaignTitle("x".repeat(190), ["Mexico", "Brazil", "United States"]);
    expect(t.length).toBe(200);
    expect(t.endsWith("…")).toBe(true);
  });
});
