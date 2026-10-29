import { describe, expect, it } from "vitest";
import { DO_NOT_BOOK, HIDDEN_NOTE, applyDoNotBook, isDoNotBook, mentionsDoNotBook, visibleClaims, visibleClaimTotals } from "./doNotBook";
import type { PlaybookCard } from "./types";

const card = (kind: PlaybookCard["kind"], items: PlaybookCard["items"]): PlaybookCard => ({ kind, status: "ok", items, refs: [], warnings: [] });

describe("doNotBook", () => {
  it("lists one act", () => { expect(DO_NOT_BOOK).toEqual(["Ariel Pink"]); });
  it("matches the exact name, case and accent folded", () => {
    expect(isDoNotBook("Ariel Pink")).toBe(true);
    expect(isDoNotBook("  ARIEL  pink ")).toBe(true);
    expect(isDoNotBook("Ariél Pínk")).toBe(true);
    expect(isDoNotBook("Ariel Pink's Haunted Graffiti")).toBe(false);
    expect(isDoNotBook("Synthetic Artist 01")).toBe(false);
  });
  it("finds the name inside prose", () => {
    expect(mentionsDoNotBook("Fans also rank Ariel Pink at 0.8.")).toBe(true);
    expect(mentionsDoNotBook("Fans rank Synthetic Artist 01.")).toBe(false);
  });
  it("words the note with the right plural", () => {
    expect(HIDDEN_NOTE(1)).toBe("1 act hidden by our do-not-book list");
    expect(HIDDEN_NOTE(2)).toBe("2 acts hidden by our do-not-book list");
  });
  it("hides co-billing and local-act items, and only artist items on local moment", () => {
    const co = applyDoNotBook(card("co_billing", [{ name: "Ariel Pink" }, { name: "Synthetic Artist 02" }]));
    expect(co.hidden).toBe(1);
    expect(co.card.items.map((i) => i.name)).toEqual(["Synthetic Artist 02"]);
    expect(applyDoNotBook(card("talent", [{ name: "Ariel Pink" }])).hidden).toBe(1);
    const lm = applyDoNotBook(card("local_moment", [{ name: "Ariel Pink", category: "artist" }, { name: "Ariel Pink", category: "place" }]));
    expect(lm.hidden).toBe(1);
    expect(lm.card.items).toHaveLength(1);
    expect(applyDoNotBook(card("sponsors", [{ name: "Ariel Pink" }])).hidden).toBe(0);
  });
  it("returns the same card when nothing is hidden", () => {
    const c = card("co_billing", [{ name: "Synthetic Artist 02" }]);
    expect(applyDoNotBook(c)).toEqual({ card: c, hidden: 0 });
  });
  it("drops verified and removed claims that mention the act, by text or entity", () => {
    const claim = (text: string, ent = "X") => ({ text, entities: [{ name: ent }], numbers: [], evidence_refs: [] });
    const out = visibleClaims({
      verified: [claim("Ariel Pink fits."), claim("Other fits.", "Ariel Pink"), claim("Safe.")],
      removed: [{ claim: claim("Ariel Pink maybe."), reason: "no_refs", detail: "" }, { claim: claim("Nope."), reason: "no_refs", detail: "" }],
    })!;
    expect(out.verified.map((c) => c.text)).toEqual(["Safe."]);
    expect(out.removed.map((r) => r.claim.text)).toEqual(["Nope."]);
    expect(visibleClaims(undefined)).toBeUndefined();
  });
  it("totals count exactly the claims the display shows", () => {
    const claim = (text: string) => ({ text, entities: [], numbers: [], evidence_refs: [] });
    const cards = {
      sponsors: { verified: [claim("Safe."), claim("Ariel Pink fits."), claim("Also safe.")], removed: [{ claim: claim("Ariel Pink maybe."), reason: "no_refs" as const, detail: "" }, { claim: claim("Nope."), reason: "no_refs" as const, detail: "" }] },
      venue_fit: undefined,
    };
    expect(visibleClaimTotals(cards)).toEqual({ verified: 2, removed: 1 });
    expect(visibleClaimTotals({ sponsors: { verified: [claim("Safe.")], removed: [] } })).toEqual({ verified: 1, removed: 0 });
  });
});
