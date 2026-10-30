// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { samplePlaybookEvents, sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import type { GatewayEvent, PlaybookCard as Card } from "@/lib/qloo/types";
import { AdvanceSheet } from "./AdvanceSheet";
import { CardBody, ThisWeekBody } from "./cardBody";
import { ClaimsAudit } from "./ClaimsAudit";
import { ClaimsBadge } from "./ClaimsBadge";
import { KeyArtPoster } from "./KeyArtPoster";
import { PlaybookCard } from "./PlaybookCard";
import { ReasoningSummary } from "./ReasoningSummary";
import { CARD_TITLE, metaLine } from "./format";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ev = samplePlaybookEvents("4005539")!;
const cards = (ev.find((e) => e.type === "playbook") as Extract<GatewayEvent, { type: "playbook" }>).playbook.cards;
const narrative = (ev.find((e) => e.type === "narrative") as Extract<GatewayEvent, { type: "narrative" }>).narrative;
const card = (k: Card["kind"]) => cards.find((c) => c.kind === k)!;

describe("playbook cards", () => {
  it("shows a zone named after the city as Central {City}", () => {
    const items = [{ label: "Los Angeles", share: 0.35 }, { label: "Hollywood", share: 0.1 }];
    render(<CardBody card={{ ...card("promo_zones"), items }} city="Los Angeles" />);
    expect(screen.getByText("Central Los Angeles")).toBeTruthy();
    expect(screen.getByText("Hollywood")).toBeTruthy();
    expect(screen.queryByText("Los Angeles")).toBeNull();
  });
  it("renders two verified claims with identical text without a duplicate-key warning", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const same = { text: "Same text.", entities: [{ name: "Same" }], numbers: [], evidence_refs: ["sponsors:0"] };
    render(<PlaybookCard accent="#ff00aa" meta="m" title="Sponsors" claims={{ verified: [same, same], removed: [] }} narrativeStatus="ok" refsCount={0} hasEvidence><p>b</p></PlaybookCard>);
    expect(screen.getAllByText("Same text.")).toHaveLength(2);
    expect(err.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  });
  it("shows verified claims and a per-card badge that opens the audit", () => {
    let opened = false;
    render(<PlaybookCard accent="#ff00aa" meta="GDL · SPONSORS" title="Sponsors" claims={narrative.status === "ok" ? narrative.cards.sponsors : undefined} narrativeStatus="ok" refsCount={1} hasEvidence onAudit={() => { opened = true; }}><p>body</p></PlaybookCard>);
    expect(screen.getByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^\d+ verified · \d+ removed\. See the \d+ checked claims for Sponsors$/ }));
    expect(opened).toBe(true);
    expect(screen.getByText("Qloo · 1 request")).toBeTruthy();
  });
  it("says the narrative was removed when no claim passed but evidence exists", () => {
    render(<PlaybookCard accent="#ff00aa" meta="m" title="Venue fit" claims={{ verified: [], removed: [] }} narrativeStatus="ok" refsCount={1} hasEvidence><p>evidence</p></PlaybookCard>);
    expect(screen.getByText("Narrative removed: no claim passed verification.")).toBeTruthy();
    expect(screen.getByText("evidence")).toBeTruthy();
  });
  it("does not claim a removed narrative when the card has no evidence", () => {
    render(<PlaybookCard accent="#ff00aa" meta="m" title="Venue fit" claims={{ verified: [], removed: [] }} narrativeStatus="ok" refsCount={1} hasEvidence={false}><p>empty</p></PlaybookCard>);
    expect(screen.queryByText("Narrative removed: no claim passed verification.")).toBeNull();
  });
  it("this week uses a fixed three-letter month and 44px source links", () => {
    render(<ThisWeekBody week={{ status: "ok", window: { start: "2027-09-01", end: "2027-09-07" }, items: [{ text: "Event", date: "2027-09-03", entities: [], citations: ["a"] }], removed: [], citations: [{ id: "a", url: "https://example.com", title: "t" }], summarised: true, cached: false }} />);
    expect(screen.getByText("3 Sep")).toBeTruthy();
    expect(screen.getByRole("link").className).toContain("min-w-11");
  });
  it("shows evidence only (no claim list) when the narrative is unavailable", () => {
    render(<PlaybookCard accent="#ff00aa" meta="m" title="Sponsors" narrativeStatus="unavailable" refsCount={1} hasEvidence><p>evidence</p></PlaybookCard>);
    expect(screen.queryByText(/verified/)).toBeNull();
    expect(screen.getByText("evidence")).toBeTruthy();
  });
  it("shows a skeleton line while the narrative is pending", () => {
    const { container } = render(<PlaybookCard accent="#ff00aa" meta="m" title="Sponsors" narrativeStatus="pending" refsCount={2} hasEvidence><p>evidence</p></PlaybookCard>);
    expect(container.querySelector(".skeleton")).toBeTruthy();
    expect(screen.getByText("Qloo · 2 requests")).toBeTruthy();
  });
  it("omits the Qloo source chip for a card with no Qloo requests (This week is web context)", () => {
    render(<PlaybookCard accent="#ff00aa" meta="m" title="This week" narrativeStatus="unavailable" refsCount={0} hasEvidence><p>web</p></PlaybookCard>);
    expect(screen.queryByText(/Qloo ·/)).toBeNull();
  });
  it("badge is a 44px button whenever there are claims, and plain text when there are none", () => {
    const { unmount } = render(<ClaimsBadge verified={3} removed={0} onClick={() => {}} label="See the 3 checked claims for Sponsors" />);
    const badge = screen.getByRole("button", { name: "3 verified · 0 removed. See the 3 checked claims for Sponsors" });
    expect(badge.className).toContain("min-h-11");
    // WCAG 2.5.3: the accessible name starts with the visible text, so voice control ("click 3 verified") works.
    expect(badge.getAttribute("aria-label")!.startsWith(badge.textContent!)).toBe(true);
    expect(screen.getByText("3 verified · 0 removed")).toBeTruthy();
    unmount();
    render(<ClaimsBadge verified={0} removed={0} onClick={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("audit lists verified claims with where they matched, and removed claims struck through with the reason", () => {
    if (narrative.status !== "ok") throw new Error();
    render(<ClaimsAudit claims={[{ card: "Sponsors", verified: narrative.cards.sponsors!.verified, removed: narrative.cards.sponsors!.removed }, { card: "Venue fit", removed: narrative.cards.venue_fit!.removed }]} />);
    expect(screen.getByText(/Every number and name in the write-up is checked/)).toBeTruthy();
    expect(screen.getByText("Cerro Alto Mezcal is the strongest sponsor fit at 0.91.").className).not.toContain("line-through");
    expect(screen.getAllByText(/^Verified: .*found in this card's Qloo results$/).length).toBeGreaterThan(0);
    expect(screen.getByText("Removed: Number 0.93 not in evidence")).toBeTruthy();
    expect(screen.getByText("Removed: Entity 'Foro Alameda' not in any referenced result")).toBeTruthy();
    expect(screen.getByText("Foro Alameda is an alternative room.").className).toContain("line-through");
  });
  it("sponsors show the top five and a +N more line", () => {
    render(<CardBody card={card("sponsors")} city="Guadalajara" />);
    expect(screen.getByText("Cerro Alto Mezcal")).toBeTruthy();
    expect(screen.queryByText("Lúpulo Tapatío")).toBeNull();
    expect(screen.getByRole("button", { name: "+5 more" })).toBeTruthy();
  });
  it("+N more expands the remaining sponsors and Show fewer collapses them", () => {
    render(<CardBody card={card("sponsors")} city="Guadalajara" />);
    fireEvent.click(screen.getByRole("button", { name: "+5 more" }));
    expect(screen.getByText("Lúpulo Tapatío")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Lúpulo Tapatío")).toBeNull();
    expect(screen.getByRole("button", { name: "+5 more" })).toBeTruthy();
  });
  it("sponsors with no city rank lead with the fan rank and say the city part once", () => {
    const items = [
      { name: "Brand A", entityId: "b1", affinity: 0.8, artistRank: 3, cityRank: null, rankLift: 18 },
      { name: "Brand B", entityId: "b2", affinity: 0.7, artistRank: 1, cityRank: null, rankLift: 12 },
    ];
    render(<CardBody card={{ ...card("sponsors"), items, summary: undefined }} city="Guadalajara" />);
    expect(screen.getByText("Fans rank it #3")).toBeTruthy();
    expect(screen.getByText("Fans rank it #1")).toBeTruthy();
    expect(screen.getAllByText("None of these brands is in the city's top 20, so they set this audience apart.")).toHaveLength(1);
    expect(screen.queryByText(/not in the city's top 20$/)).toBeNull();
  });
  it("sponsors without rank fields (short city baseline) show fit and no top-20 note or deal line", () => {
    const items = [
      { name: "Brand A", entityId: "b1", affinity: 0.8 },
      { name: "Brand B", entityId: "b2", affinity: 0.7 },
    ];
    render(<CardBody card={{ ...card("sponsors"), items, summary: undefined }} city="Guadalajara" venueName="Foro Alameda" />);
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(screen.queryByText(/top 20/)).toBeNull();
    expect(screen.queryByTestId("sponsor-deal")).toBeNull();
  });
  it("sponsors end with one deal line for the top brand, naming the venue when given", () => {
    const items = [
      { name: "Brand A", entityId: "b1", affinity: 0.8, artistRank: 3, cityRank: null, rankLift: 18 },
      { name: "Brand B", entityId: "b2", affinity: 0.7, artistRank: 1, cityRank: null, rankLift: 12 },
    ];
    const { rerender } = render(<CardBody card={{ ...card("sponsors"), items, summary: undefined }} city="Guadalajara" venueName="Foro Alameda" />);
    expect(screen.getAllByTestId("sponsor-deal")).toHaveLength(1);
    expect(screen.getByTestId("sponsor-deal").textContent).toBe("Brand A is #3 with fans and not in Guadalajara's top 20. Suggested ask: presale access or a co-branded night at Foro Alameda.");
    rerender(<CardBody card={{ ...card("sponsors"), items, summary: undefined }} city="Guadalajara" />);
    expect(screen.getByTestId("sponsor-deal").textContent).toContain("co-branded night on the tour stop.");
    expect(screen.getByTestId("sponsor-deal").textContent).not.toMatch(/places higher/);
  });
  it("sponsors show no deal line when the top brand has no lift", () => {
    const items = [{ name: "Brand A", entityId: "b1", affinity: 0.8, artistRank: 2, cityRank: 2, rankLift: 0 }];
    render(<CardBody card={{ ...card("sponsors"), items, summary: undefined }} city="Guadalajara" venueName="Foro Alameda" />);
    expect(screen.queryByTestId("sponsor-deal")).toBeNull();
  });
  it("sponsors show where fans and the city rank each brand, and the ranking note", () => {
    const items = [
      { name: "Brand A", entityId: "b1", affinity: 0.8, artistRank: 3, cityRank: null, rankLift: 18 },
      { name: "Brand B", entityId: "b2", affinity: 0.7, artistRank: 1, cityRank: 2, rankLift: 1 },
    ];
    render(<CardBody card={{ ...card("sponsors"), items, summary: { note: "Ranked by how much higher this artist's fans rank the brand than the city overall does." } }} city="Guadalajara" />);
    expect(screen.getByText("Fans #3 · not in the city's top 20")).toBeTruthy();
    expect(screen.getByText("Fans #1 · city #2")).toBeTruthy();
    expect(screen.queryByText(/vs city/)).toBeNull();
    expect(screen.getByText("Ranked by how much higher this artist's fans rank the brand than the city overall does.")).toBeTruthy();
  });
  it("local-moment film and tv rows show the same rank line", () => {
    const items = [{ name: "Film A", entityId: "m1", category: "movie", affinity: 0.8, artistRank: 2, cityRank: null, rankLift: 19 }, { name: "Show B", entityId: "t1", category: "tv_show", affinity: 0.7, artistRank: 1, cityRank: 14, rankLift: 13 }, { name: "Band C", entityId: "a1", category: "artist", affinity: 0.9 }];
    render(<CardBody card={{ ...card("local_moment"), items }} city="Guadalajara" />);
    expect(screen.getByText("Fans #2 · not in the city's top 20")).toBeTruthy();
    expect(screen.getByText("Fans #1 · city #14")).toBeTruthy();
    expect(screen.getByText("0.90")).toBeTruthy(); // artists keep the affinity
  });
  it("sponsors without rank fields fall back to the affinity and show no note", () => {
    render(<CardBody card={{ ...card("sponsors"), items: [{ name: "Brand A", entityId: "b1", affinity: 0.8 }], summary: undefined }} city="Guadalajara" />);
    expect(screen.queryByText(/vs city/)).toBeNull();
    expect(screen.getByText("0.80")).toBeTruthy();
  });
  it("co-billing and the acts card show the support-scale copy when empty", () => {
    const copy = "Every Qloo match is bigger than Lumen Vale, so no support pick here.";
    const { unmount } = render(<CardBody card={{ ...card("co_billing"), status: "empty", items: [], summary: { biggerThanHeadliner: 3, popularityUnknown: 0, emptyCopy: copy } }} city="Guadalajara" />);
    expect(screen.getByText(copy)).toBeTruthy();
    unmount();
    render(<CardBody card={{ ...card("talent"), status: "empty", items: [], summary: { sharedTaste: null, sharedTags: [], emptyCopy: copy } }} city="Guadalajara" />);
    expect(screen.getByText(copy)).toBeTruthy();
  });
  it("support cards that could not be size-checked say so", () => {
    render(<CardBody card={{ ...card("co_billing"), summary: { sizeNote: "Couldn't check act size for this artist." } }} city="Guadalajara" />);
    expect(screen.getByText("Couldn't check act size for this artist.")).toBeTruthy();
  });
  it("promo zones list the rows by share, strongest first", () => {
    const items = [{ label: "Small", share: 0.1 }, { label: "Central Guadalajara", share: 0.6 }, { label: "Mid", share: 0.3 }];
    render(<CardBody card={{ ...card("promo_zones"), items }} city="Guadalajara" />);
    expect(screen.getAllByRole("row").slice(1).map((r) => r.textContent?.replace("Google Maps ↗", ""))).toEqual(["Central Guadalajara60%", "Mid30%", "Small10%"]);
    expect(screen.getByText("Top 3 hold 100% of in-city heat")).toBeTruthy();
  });
  it("co-billing shows both lift factors", () => {
    render(<CardBody card={card("co_billing")} city="Guadalajara" />);
    expect(screen.getByText("Fans share taste 34% · the city likes them 88%")).toBeTruthy();
    expect(screen.getByText("Fans share taste 34% · the city likes them 88%").getAttribute("title")).toBe("0.34 × 0.88 = 0.30");
    expect(screen.queryByText(/×/)).toBeNull();
    expect(screen.getByText("How much fans share taste, and how much the city likes the act")).toBeTruthy();
  });
  it("co-billing rows let the name take the space: aside capped, name can shrink and wrap", () => {
    render(<CardBody card={card("co_billing")} city="Guadalajara" />);
    const aside = screen.getByText("Fans share taste 34% · the city likes them 88%").parentElement!;
    expect(aside.className).toMatch(/max-w-\[45%\]/);
    expect(aside.className).toMatch(/shrink-0/);
    const li = aside.parentElement!;
    expect(li.firstElementChild!.className).toMatch(/min-w-0/);
    expect(li.firstElementChild!.className).toMatch(/flex-1/);
    expect(li.firstElementChild!.firstElementChild!.className).toMatch(/break-words/);
  });
  it("co-billing shows identical shared tags once in the caption, not per row", () => {
    const base = card("co_billing");
    const mk = (name: string, tags: string[]) => ({ ...base.items[0]!, name, sharedTags: tags });
    const { unmount } = render(<CardBody card={{ ...base, items: [mk("Act One", ["Electronic", "Funk", "Dub"]), mk("Act Two", ["Electronic", "Funk", "Dub"])] }} city="Guadalajara" />);
    expect(screen.getByText("Shared taste: Electronic · Funk · Dub")).toBeTruthy();
    expect(screen.queryAllByText("Electronic")).toHaveLength(0);
    unmount();
    render(<CardBody card={{ ...base, items: [mk("Act One", ["Electronic", "Funk"]), mk("Act Two", ["Dub"])] }} city="Guadalajara" />);
    expect(screen.queryByText(/Shared taste:/)).toBeNull();
    expect(screen.getByText("Electronic")).toBeTruthy();
    expect(screen.getByText("Dub")).toBeTruthy();
  });
  it("talent shows shared taste, tags and the proxy list", () => {
    render(<CardBody card={card("talent")} city="Guadalajara" />);
    expect(screen.getByText("Shared taste with Guadalajara's mainstream: 0.12")).toBeTruthy();
    expect(screen.getByText("dream pop")).toBeTruthy();
    expect(screen.getByText("Acts fans rank highly here: popular in the city, each found in Qloo and ranked by taste fit with the headliner.")).toBeTruthy();
    expect(screen.getByText("Not all are from the city — check before billing as a local guest.")).toBeTruthy();
    expect(screen.queryByText(/Gemini/)).toBeNull(); // the sample carries no suggested item
    expect(screen.queryByText(/without the artist signal/)).toBeNull();
  });
  it("talent caption names the artist when known", () => {
    render(<CardBody card={card("talent")} city="Guadalajara" artist="Lumen Vale" />);
    expect(screen.getByText("Acts fans rank highly here: popular in the city, each found in Qloo and ranked by taste fit with Lumen Vale.")).toBeTruthy();
  });
  it("talent caption mentions Gemini only when an item was suggested", () => {
    const base = card("talent");
    render(<CardBody card={{ ...base, items: [{ name: "Drake", entityId: "e1", affinity: 0.9, source: "suggested" }] }} city="Toronto" artist="Lumen Vale" />);
    expect(screen.getByText("Acts fans rank highly here: candidates suggested by Gemini or popular in the city, each found in Qloo and ranked by taste fit with Lumen Vale.")).toBeTruthy();
  });
  it("talent says the list is unranked and shows no fit value when ranking was unavailable", () => {
    const base = card("talent");
    const items = [{ name: "Drake", entityId: "e1", affinity: 0.91, source: "suggested" }, { name: "Local Band", entityId: "e2", affinity: 0.55, source: "city_popular" }];
    render(<CardBody card={{ ...base, items, summary: { ...base.summary, rankUnavailable: true } }} city="Toronto" artist="Lumen Vale" />);
    expect(screen.getByText("Acts fans rank highly here: candidates suggested by Gemini or popular in the city, each found in Qloo. Taste ranking was unavailable, so they are not ranked.")).toBeTruthy();
    expect(screen.queryByText(/ranked by taste fit/)).toBeNull();
    expect(screen.queryByText("0.91")).toBeNull();
    expect(screen.queryByText("0.55")).toBeNull();
    cleanup();
    render(<CardBody card={{ ...base, items: [{ name: "Local Band", entityId: "e2", affinity: 0.55, source: "city_popular" }], summary: { ...base.summary, rankUnavailable: true } }} city="Toronto" />);
    expect(screen.getByText("Acts fans rank highly here: popular in the city, each found in Qloo. Taste ranking was unavailable, so they are not ranked.")).toBeTruthy();
  });
  it("talent rows carry a text source label and an unresolved note only when some suggestions were not found", () => {
    const base = card("talent");
    const hybrid: Card = { ...base, items: [{ name: "Drake", entityId: "e1", affinity: 0.9, source: "suggested" }, { name: "Local Band", entityId: "e2", affinity: 0.5, source: "city_popular" }, { name: "Plain", entityId: "e3", affinity: 0.4 }], summary: { ...base.summary, suggestionsUnresolved: 2 } };
    render(<CardBody card={hybrid} city="Toronto" />);
    expect(screen.getAllByText("Suggested · in Qloo")).toHaveLength(1);
    expect(screen.getAllByText("Popular in city")).toHaveLength(1);
    expect(screen.getByText("2 suggestions weren't found in Qloo and are not shown.")).toBeTruthy();
    cleanup();
    render(<CardBody card={{ ...hybrid, summary: { ...base.summary, suggestionsUnresolved: 0 } }} city="Toronto" />);
    expect(screen.queryByText(/weren't found in Qloo/)).toBeNull();
    cleanup();
    render(<CardBody card={base} city="Toronto" />);
    expect(screen.queryByText(/Suggested · in Qloo|Popular in city/)).toBeNull();
  });
  it("talent: unresolved and unchecked suggestions are separate lines", () => {
    render(<CardBody card={{ ...card("talent"), summary: { sharedTaste: null, sharedTags: [], suggestionsUnresolved: 2, suggestionsSkipped: 3 } }} city="Toronto" />);
    expect(screen.getByText("2 suggestions weren't found in Qloo and are not shown.")).toBeTruthy();
    expect(screen.getByText("3 more weren't checked (lookup limit).")).toBeTruthy();
    cleanup();
    render(<CardBody card={{ ...card("talent"), summary: { sharedTaste: null, sharedTags: [], suggestionsUnresolved: 0, suggestionsSkipped: 3 } }} city="Toronto" />);
    expect(screen.queryByText(/weren't found/)).toBeNull();
    expect(screen.getByText("3 more weren't checked (lookup limit).")).toBeTruthy();
    cleanup();
    render(<CardBody card={{ ...card("talent"), summary: { sharedTaste: null, sharedTags: [], suggestionsSkipped: 1 } }} city="Toronto" />);
    expect(screen.getByText("1 more wasn't checked (lookup limit).")).toBeTruthy();
  });
  it("talent unresolved line is singular for one suggestion", () => {
    render(<CardBody card={{ ...card("talent"), summary: { sharedTaste: null, sharedTags: [], suggestionsUnresolved: 1 } }} city="Toronto" />);
    expect(screen.getByText("1 suggestion wasn't found in Qloo and is not shown.")).toBeTruthy();
  });
  it("local moment card is titled for fans, with the promo hint", () => {
    render(<CardBody card={card("local_moment")} city="Guadalajara" />);
    expect(screen.getByText(/rank highly in this city\. Use them for local promo/)).toBeTruthy();
    expect(CARD_TITLE.local_moment).toBe("What these fans love here");
    expect(metaLine("LA", "local_moment", card("local_moment"))).toMatch(/^LA · WHAT THESE FANS LOVE HERE · \d+ PICKS$/);
  });
  it("local moment labels entity types", () => {
    render(<CardBody card={card("local_moment")} city="Guadalajara" />);
    expect(screen.getByText("Artist")).toBeTruthy();
    expect(screen.getAllByText("Place").length).toBe(2);
  });
  it("promo zones shows the top-3 share and an honest empty state", () => {
    const { unmount } = render(<CardBody card={card("promo_zones")} city="Guadalajara" />);
    expect(screen.getByText("Top 3 hold 81% of in-city heat")).toBeTruthy();
    unmount();
    render(<CardBody card={{ ...card("promo_zones"), status: "empty", items: [] }} city="Curitiba" />);
    expect(screen.getByText("Qloo returned no neighbourhood data for Curitiba")).toBeTruthy();
  });
  it("other empty cards say what Qloo did not return", () => {
    render(<CardBody card={{ ...card("sponsors"), status: "empty", items: [] }} city="Curitiba" />);
    expect(screen.getByText("Qloo returned no sponsors for Curitiba")).toBeTruthy();
  });
  it("an empty venue card says Qloo lists no music venues, never a padded list", () => {
    render(<CardBody card={{ ...card("venue_fit"), status: "empty", items: [] }} city="Curitiba" />);
    expect(screen.getByText("Qloo lists no music venues in Curitiba for this artist")).toBeTruthy();
  });
  it("labels the merch creative direction as a model suggestion", () => {
    render(<CardBody card={card("merch")} merch={narrative.status === "ok" ? narrative.merch : null} city="Guadalajara" />);
    expect(screen.getByText("Jacaranda season")).toBeTruthy();
    expect(screen.getByText("Creative direction — model suggestion, not Qloo data")).toBeTruthy();
    expect(screen.getByText("Inspired by")).toBeTruthy();
  });
  it("merch hides the Inspired by label when there are no tags", () => {
    render(<CardBody card={{ ...card("merch"), items: [] }} merch={narrative.status === "ok" ? narrative.merch : null} city="Guadalajara" />);
    expect(screen.getByText("Jacaranda season")).toBeTruthy();
    expect(screen.queryByText("Inspired by")).toBeNull();
  });
  it("merch without a direction shows tag chips only", () => {
    render(<CardBody card={card("merch")} merch={null} city="Guadalajara" />);
    expect(screen.queryByText(/Creative direction/)).toBeNull();
    expect(screen.getByText(/dream pop/)).toBeTruthy();
  });
  it("this week shows dated items with source links, and unavailable states honestly", () => {
    const { unmount } = render(<ThisWeekBody week={sampleThisWeek("4005539")!} />);
    const item = screen.getByText("Film festival week in the city, 13–19 Mar").closest("li")!;
    expect(within(item).getAllByRole("link")).toHaveLength(2);
    expect(within(item).getAllByRole("link")[0]!.getAttribute("rel")).toBe("noreferrer");
    expect(within(item).getByText("13 Mar")).toBeTruthy();
    unmount();
    render(<ThisWeekBody week={{ status: "unavailable", reason: "capped", message: "Live web context unavailable — daily search limit reached" }} />);
    expect(screen.getByText("Live web context unavailable — daily search limit reached")).toBeTruthy();
  });
  it("this week handles unsummarised and empty results", () => {
    const base = { status: "ok" as const, window: { start: "2027-03-12", end: "2027-03-18" }, items: [], removed: [], cached: true };
    const { unmount } = render(<ThisWeekBody week={{ ...base, summarised: false, citations: [{ id: "w1", url: "https://example.com/a", title: "Festival guide" }] }} />);
    expect(screen.getByText("Sources found; summary unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Festival guide" }).getAttribute("href")).toBe("https://example.com/a");
    expect(screen.getByText("From cache")).toBeTruthy();
    unmount();
    render(<ThisWeekBody week={{ ...base, summarised: true, citations: [] }} />);
    expect(screen.getByText("Nothing notable found for these dates")).toBeTruthy();
  });
  it("reasoning summary is collapsed until opened and passes text verbatim", () => {
    render(<ReasoningSummary narrative={narrative} />);
    const toggle = screen.getByRole("button", { name: "Model reasoning summary" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByText(/Sponsor fit is high and concentrated/)).toBeTruthy();
    expect(screen.getByText(/^Model: /)).toBeTruthy();
  });
  it("reasoning summary never carries a do-not-book act or a non-sponsor organisation, even collapsed", () => {
    for (const named of ["Ariel Pink", "UNICEF"]) {
      const { container, unmount } = render(<ReasoningSummary narrative={{ ...(narrative as Extract<typeof narrative, { status: "ok" }>), thoughtSummary: `Fans also rank ${named} highly in this city.` }} />);
      expect(container.textContent, named).not.toContain(named);
      unmount();
    }
  });
  it("reasoning summary renders nothing when unavailable or null", () => {
    const { container } = render(<ReasoningSummary narrative={{ status: "unavailable", reason: "error", message: "x" }} />);
    expect(container.innerHTML).toBe("");
  });
  it("poster is an accessible image with only the city name as text", () => {
    const { container } = render(<KeyArtPoster city="Guadalajara" accent="#ff00aa" ratio="4:5" />);
    expect(screen.getByRole("img", { name: "Guadalajara poster" })).toBeTruthy();
    expect(container.querySelector("svg")!.textContent!.replace(/\s/g, "")).toBe("Guadalajara");
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 400 500");
    expect(container.innerHTML).not.toMatch(/linearGradient|radialGradient|blur/);
  });
  it("poster breaks long names onto two lines and supports 16:9", () => {
    const { container } = render(<KeyArtPoster city="Santiago de Querétaro" accent="#ff00aa" ratio="16:9" />);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 1600 900");
    expect(container.querySelectorAll("text")).toHaveLength(2);
  });
  it("advance sheet renders label/value pairs with title attributes", () => {
    render(<AdvanceSheet rows={[{ label: "TOP ZONE", value: "Colonia Americana" }, { label: "CLAIMS", value: "7 verified" }]} />);
    expect(screen.getByText("TOP ZONE")).toBeTruthy();
    expect(screen.getByText("Colonia Americana").getAttribute("title")).toBe("Colonia Americana");
  });
  it("advance sheet values wrap instead of truncating, and a tile with an action becomes a button", () => {
    let hit = false;
    render(<AdvanceSheet rows={[{ label: "CLAIMS", value: "11 verified · 0 removed", onClick: () => { hit = true; }, aria: "See the 11 checked claims" }]} />);
    expect(screen.getByTitle("11 verified · 0 removed").className).not.toContain("truncate");
    fireEvent.click(screen.getByRole("button", { name: "11 verified · 0 removed. See the 11 checked claims" }));
    expect(hit).toBe(true);
  });
  it("keeps organisations off the sponsor card, with a caption, a visible-only count and an ask that names a real brand", () => {
    const items = [
      { name: "Planned Parenthood", artistRank: 1, cityRank: null }, { name: "ACLU", artistRank: 2, cityRank: null }, { name: "Black Lives Matter", artistRank: 3, cityRank: null },
      { name: "Stüssy", artistRank: 4, cityRank: null }, { name: "Vans", artistRank: 5, cityRank: null },
    ];
    const sponsors: Card = { ...card("sponsors"), items };
    render(<CardBody card={sponsors} city="Seattle" />);
    for (const n of ["Planned Parenthood", "ACLU", "Black Lives Matter"]) expect(screen.queryByText(n)).toBeNull();
    expect(screen.getByText("Stüssy")).toBeTruthy();
    expect(screen.getByText("3 organisations hidden (not sponsors)")).toBeTruthy();
    expect(screen.getByTestId("sponsor-deal").textContent).toContain("Stüssy is #4 with fans");
    expect(metaLine("SEA", "sponsors", sponsors)).toBe("SEA · SPONSORS · 2 BRANDS");
  });
  it("says '1 organisation hidden (not sponsors)' for one", () => {
    render(<CardBody card={{ ...card("sponsors"), items: [{ name: "ACLU" }, { name: "Vans" }] }} city="Seattle" />);
    expect(screen.getByText("1 organisation hidden (not sponsors)")).toBeTruthy();
  });
  it("shows one muted line when the sponsor check was unavailable, and not otherwise", () => {
    const line = "Sponsor check unavailable; showing brands not on our exclusion list.";
    const items = [{ name: "Vans", artistRank: 1, cityRank: null }];
    const { unmount } = render(<CardBody card={{ ...card("sponsors"), items, summary: { sponsorCheck: "unavailable" } }} city="Seattle" />);
    expect(screen.getAllByText(line)).toHaveLength(1);
    unmount();
    render(<CardBody card={{ ...card("sponsors"), items }} city="Seattle" />);
    expect(screen.queryByText(line)).toBeNull();
  });
  it("shows the 'not in the city's top 20' note only when no item in the whole visible list has a city rank", () => {
    const off = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Brand ${i + 1}`, artistRank: i + 1, cityRank: null }));
    const { unmount } = render(<CardBody card={{ ...card("sponsors"), items: off(7) }} city="Seattle" />);
    expect(screen.getByText(/None of these brands is in the city's top 20/)).toBeTruthy();
    unmount();
    render(<CardBody card={{ ...card("sponsors"), items: [...off(6), { name: "Brand 7", artistRank: 7, cityRank: 14 }] }} city="Seattle" />);
    expect(screen.queryByText(/None of these brands is in the city's top 20/)).toBeNull();
    expect(screen.getByText("Fans #1 · not in the city's top 20")).toBeTruthy();
  });
});
