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
