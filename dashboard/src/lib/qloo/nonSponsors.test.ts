import { describe, expect, it } from "vitest";
import { applyDoNotBook, visibleClaimTotals, visibleClaims } from "./doNotBook";
import { HIDDEN_ORGS_NOTE, NON_SPONSOR_ENDINGS, NON_SPONSOR_NAMES, isNonSponsor, mentionsNonSponsor } from "./nonSponsors";
import type { PlaybookCard } from "./types";

const card = (kind: PlaybookCard["kind"], items: PlaybookCard["items"], summary?: PlaybookCard["summary"]): PlaybookCard => ({ kind, status: "ok", items, refs: [], warnings: [], ...(summary ? { summary } : {}) });
const claim = (text: string, ent?: string) => ({ text, entities: ent ? [{ name: ent }] : [], numbers: [], evidence_refs: [] });

describe("nonSponsors", () => {
  it("lists the disclosed names and endings", () => {
    expect(NON_SPONSOR_NAMES).toHaveLength(27);
    expect(NON_SPONSOR_ENDINGS).toEqual([" Foundation", " Party", " Church"]);
  });
  it("matches listed names folded, whole words, and generic endings", () => {
    for (const n of NON_SPONSOR_NAMES) expect(isNonSponsor(n.toUpperCase())).toBe(true);
    expect(isNonSponsor("Plánned Parenthood")).toBe(true);
    expect(isNonSponsor("Ford Foundation")).toBe(true);
    expect(isNonSponsor("Party City")).toBe(false);
    for (const n of ["Stüssy", "OBEY", "Kith", "HUF", "Off-White", "Vans", "Converse", "Costar", "Vice", "The Onion", "ClickHole", "Unicorn Goods"]) expect(isNonSponsor(n)).toBe(false);
  });
  it("words the caption with the right plural", () => {
    expect(HIDDEN_ORGS_NOTE(1)).toBe("1 organisation hidden (not sponsors)");
    expect(HIDDEN_ORGS_NOTE(3)).toBe("3 organisations hidden (not sponsors)");
  });
  it("removes organisations from a sponsors card only, and counts them", () => {
    const items = [{ name: "Planned Parenthood" }, { name: "ACLU" }, { name: "Stüssy" }, { name: "Black Lives Matter" }, { name: "Vans" }];
    const r = applyDoNotBook(card("sponsors", items));
    expect(r.card.items.map((i) => i.name)).toEqual(["Stüssy", "Vans"]);
    expect(r).toMatchObject({ hidden: 0, hiddenOrgs: 3 });
    expect(applyDoNotBook(card("local_moment", [{ name: "Black Lives Matter" }])).hiddenOrgs).toBe(0);
  });
  it("adds the count the gateway already removed", () => {
    const c = card("sponsors", [{ name: "Vans" }], { hiddenNonSponsors: 2 });
    expect(applyDoNotBook(c)).toEqual({ card: c, hidden: 0, hiddenOrgs: 2 });
    expect(applyDoNotBook(card("sponsors", [{ name: "ACLU" }, { name: "Vans" }], { hiddenNonSponsors: 2 })).hiddenOrgs).toBe(3);
  });
  it("hides and does not count claims that name an organisation", () => {
    expect(mentionsNonSponsor("For Black Lives Matter, fans rank it #7")).toBe(true);
    const out = visibleClaims({ verified: [claim("For Black Lives Matter, fans rank it #7."), claim("Fans rank Vans #2."), claim("Fits.", "Ford Foundation")], removed: [{ claim: claim("ACLU maybe."), reason: "no_refs", detail: "" }] })!;
    expect(out.verified.map((c) => c.text)).toEqual(["Fans rank Vans #2."]);
    expect(out.removed).toEqual([]);
    expect(visibleClaimTotals({ sponsors: { verified: [claim("Planned Parenthood leads."), claim("Vans leads.")], removed: [{ claim: claim("ACLU?"), reason: "no_refs", detail: "" }] } })).toEqual({ verified: 1, removed: 0 });
  });
});
