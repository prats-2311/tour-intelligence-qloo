import { describe, expect, it } from "vitest";
import type { PlaybookCard } from "./types";
import { buildPitchSheet, type PitchInput } from "./pitchSheet";

const card = (kind: PlaybookCard["kind"], items: Array<Record<string, unknown>>, status: PlaybookCard["status"] = "ok"): PlaybookCard => ({ kind, status, items, refs: [], warnings: [] } as PlaybookCard);
const cards = (): PlaybookCard[] => [
  card("sponsors", [{ name: "Stüssy", artistRank: 1, cityRank: null }, { name: "HUF", artistRank: 2, cityRank: 4 }, { name: "Planned Parenthood", artistRank: 3, cityRank: 9 }]),
  card("promo_zones", [{ label: "Silver Lake", share: 0.12 }, { label: "Echo Park", share: 0.31 }, { label: "Los Angeles", share: 0.2 }, { label: "Venice", share: 0.05 }]),
  card("venue_fit", [{ name: "The Echo", affinity: 0.91 }, { name: "Teragram Ballroom", affinity: 0.84 }]),
  card("co_billing", [{ name: "Ariel Pink", sharedTaste: 0.5, localAffinity: 0.9, lift: 0.45 }, { name: "Mild High Club", sharedTaste: 0.4, localAffinity: 0.8, lift: 0.32 }]),
];
const base = (over: Partial<PitchInput> = {}): PitchInput => ({
  brand: "Stüssy", artist: "Mac DeMarco", city: { id: "9", name: "Los Angeles", country: "US" }, cards: cards(),
  source: "showcase", recordedAt: "2026-10-16T08:00:00.000Z", today: new Date("2026-10-30T10:00:00Z"), ...over,
});
const ok = (i: PitchInput) => { const s = buildPitchSheet(i); if (s.status !== "ok") throw new Error("unavailable"); return s; };

describe("pitch sheet: header and why this brand", () => {
  it("addresses the brief to the brand with artist, city, date and the prepared-with line", () => {
    const s = ok(base());
    expect(s.title).toBe("Stüssy × Mac DeMarco — Los Angeles");
    expect(s.date).toBe("30 Oct 2026");
    expect(s.preparedWith).toBe("Prepared with Tour Intelligence × Qloo");
  });
  it("words an off-chart brand as fan rank and 'not in the city's top 20'", () => {
    expect(ok(base()).why).toBe("Mac DeMarco's fans rank Stüssy #1 in Los Angeles; it is not in the city's top 20.");
  });
  it("words a city-ranked brand with both ranks", () => {
    expect(ok(base({ brand: "HUF" })).why).toBe("Mac DeMarco's fans rank HUF #2 in Los Angeles; it is #4 for the city overall.");
  });
  it("matches the brand ignoring case and accents", () => {
    expect(ok(base({ brand: "STUSSY" })).title).toContain("Stüssy ×");
  });
  it("refuses a hidden non-sponsor, a do-not-book act and a brand not on the list, never echoing the do-not-book name", () => {
    for (const brand of ["Planned Parenthood", "Ariel Pink", "ariel  pink"]) {
      const s = buildPitchSheet(base({ brand }));
      expect(s).toEqual({ status: "unavailable", message: "This name isn't available for a pitch sheet." });
    }
    expect(buildPitchSheet(base({ brand: "Nobody Co" })).status).toBe("unavailable");
  });
});

import type { SegmentBand, SponsorSegments } from "./segments";
import type { ThisWeek } from "./types";

const band = (over: Partial<SegmentBand> = {}): SegmentBand => ({ band: "25_to_29", phrase: "25-29", index: 0.91, status: "ok", hiddenCount: 0, newInTop5: 2, lifted: true, items: [{ name: "Stüssy", entityId: "1", artistRank: 3, cityRank: null }], ...over });
const segs = (bands: SegmentBand[], status: SponsorSegments["status"] = "ok"): SponsorSegments => ({ status, indexes: {}, bands });
const week: ThisWeek = { status: "ok", window: { start: "2026-11-01", end: "2026-11-07" }, items: [{ text: "Street fair on Sunset", date: "2026-11-03", entities: [], citations: ["a", "zz"] }, { text: "No cited item", date: null, entities: [], citations: [] }], removed: [], citations: [{ id: "a", url: "https://example.com/fair", title: "Fair" }], summarised: true, cached: false };

describe("pitch sheet: age bands, zones, the night", () => {
  it("lists age bands where the brand is in the top 10, with rank and the signed index (not a share)", () => {
    const s = ok(base({ segments: segs([band(), band({ band: "30_to_34", index: -0.2, items: [{ name: "Stüssy", entityId: "1", artistRank: 11, cityRank: null }] }), band({ band: "35_to_44", index: 0.4, items: [{ name: "HUF", entityId: "2", artistRank: 1, cityRank: 3 }] })]) }));
    expect(s.segments).toEqual({ state: "bands", lines: ["Aged 25–29: #3 in this band, index +0.91 vs the average audience, not a share."], note: null });
  });
  it("adds the under-21 note for a US 18-24 band", () => {
    const s = ok(base({ segments: segs([band({ band: "24_and_younger", phrase: "18-24" })]) }));
    expect(s.segments.state === "bands" && s.segments.note).toBe("Includes under-21s: keep alcohol sponsors out of this segment.");
  });
  it("says the brand is in no band's top 10 when bands are loaded but none holds it", () => {
    const s = ok(base({ segments: segs([band({ items: [{ name: "HUF", entityId: "2", artistRank: 1, cityRank: 3 }] })]) }));
    expect(s.segments).toEqual({ state: "none", message: "Not in the top 10 of any age group." });
  });
  it("shows the muted prompt when the store has nothing (or an unavailable answer)", () => {
    const want = { state: "missing", message: "Open 'By age group' on the playbook to add the age breakdown." };
    expect(ok(base()).segments).toEqual(want);
    expect(ok(base({ segments: null })).segments).toEqual(want);
    expect(ok(base({ segments: segs([], "unavailable") })).segments).toEqual(want);
  });
  it("lists the top 3 promo zones by share, naming the city's own label Central", () => {
    expect(ok(base()).zones).toEqual([{ label: "Echo Park", share: "31%" }, { label: "Central Los Angeles", share: "20%" }, { label: "Silver Lake", share: "12%" }]);
  });
  it("names the best room with its fit score and the opener, skipping the do-not-book act", () => {
    const s = ok(base());
    expect(s.room).toEqual({ name: "The Echo", fit: "0.91" });
    expect(s.opener).toBe("Mild High Club");
    expect(JSON.stringify(s)).not.toMatch(/Ariel Pink/);
  });
  it("carries this-week items with their source links, only for items that have them", () => {
    const s = ok(base({ week }));
    expect(s.week).toEqual([{ text: "Street fair on Sunset", date: "3 Nov", links: [{ n: 1, href: "https://example.com/fair" }] }, { text: "No cited item", date: null, links: [] }]);
    expect(ok(base()).week).toEqual([]);
    expect(ok(base({ week: { status: "unavailable", reason: "error", message: "x" } as ThisWeek })).week).toEqual([]);
  });
});
