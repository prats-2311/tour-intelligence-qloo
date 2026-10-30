import { describe, expect, it } from "vitest";
import type { PlaybookCard as Card } from "@/lib/qloo/types";
import { heroWhys } from "./heroWhy";

const card = (kind: Card["kind"], items: Card["items"], status: Card["status"] = "ok"): Card => ({ kind, status, items, refs: [], warnings: [] });
const zones = card("promo_zones", [{ label: "Alpha Quarter", share: 0.31 }, { label: "Beta Quarter", share: 0.2 }, { label: "Gamma Quarter", share: 0.1 }]);
const rooms = card("venue_fit", [{ name: "Room One", affinity: 0.94 }, { name: "Room Two", affinity: 0.9 }]);
const acts = card("co_billing", [{ name: "Synthetic Artist 02", sharedTaste: 0.62, localAffinity: 0.4, lift: 0.25, sharedTags: [] }]);

describe("hero tile why lines (derived from the loaded cards only)", () => {
  it("top zone: share and rank among zones, same % format as the card", () => {
    expect(heroWhys([zones]).top_zone).toEqual({ text: "31% of in-city fan heat (#1 of 3 zones)", card: "promo_zones" });
  });
  it("best room: venue fit to two decimals and rank among rooms", () => {
    expect(heroWhys([rooms]).best_room).toEqual({ text: "venue fit 0.94, #1 of 2 rooms", card: "venue_fit" });
  });
  it("support: the Co-billing card's own wording", () => {
    expect(heroWhys([acts]).support).toEqual({ text: "fans share taste 62% · the city likes them 40%", card: "co_billing" });
  });
  it("ranks by the value, so a first item that is not the biggest says so", () => {
    const z = card("promo_zones", [{ label: "Beta Quarter", share: 0.2 }, { label: "Alpha Quarter", share: 0.31 }]);
    expect(heroWhys([z]).top_zone?.text).toBe("20% of in-city fan heat (#2 of 2 zones)");
  });
  it("omits a line when the data is missing, never guesses", () => {
    expect(heroWhys([])).toEqual({});
    expect(heroWhys([card("promo_zones", [{ label: "A" }]), card("venue_fit", [{ name: "R" }]), card("co_billing", [{ name: "X", sharedTaste: 0.5 }])])).toEqual({});
    expect(heroWhys([card("promo_zones", [], "empty")])).toEqual({});
  });
  it("skips a do-not-book act and uses the next one (same item as the tile)", () => {
    const c = card("co_billing", [{ name: "Ariel Pink", sharedTaste: 0.9, localAffinity: 0.9, lift: 0.8 }, { name: "Synthetic Artist 02", sharedTaste: 0.5, localAffinity: 0.3, lift: 0.15 }]);
    expect(heroWhys([c]).support?.text).toBe("fans share taste 50% · the city likes them 30%");
  });
});
