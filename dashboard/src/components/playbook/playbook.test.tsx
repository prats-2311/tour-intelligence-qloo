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

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ev = samplePlaybookEvents("4005539")!;
const cards = (ev.find((e) => e.type === "playbook") as Extract<GatewayEvent, { type: "playbook" }>).playbook.cards;
const narrative = (ev.find((e) => e.type === "narrative") as Extract<GatewayEvent, { type: "narrative" }>).narrative;
const card = (k: Card["kind"]) => cards.find((c) => c.kind === k)!;

describe("playbook cards", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "2 verified · 1 removed" }));
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
  it("badge is a 44px button only when something was removed", () => {
    const { unmount } = render(<ClaimsBadge verified={3} removed={0} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("3 verified · 0 removed")).toBeTruthy();
    unmount();
    render(<ClaimsBadge verified={3} removed={2} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "3 verified · 2 removed" }).className).toContain("min-h-11");
  });
  it("audit lists each removed claim with its plain-language reason", () => {
    if (narrative.status !== "ok") throw new Error();
    render(<ClaimsAudit claims={[{ card: "Sponsors", removed: narrative.cards.sponsors!.removed }, { card: "Venue fit", removed: narrative.cards.venue_fit!.removed }]} />);
    expect(screen.getByText("Number 0.93 not in evidence")).toBeTruthy();
    expect(screen.getByText("Entity 'Foro Alameda' not in any referenced result")).toBeTruthy();
    expect(screen.getByText("Foro Alameda is an alternative room.").className).toContain("line-through");
  });
  it("sponsors show the top five and a +N more line", () => {
    render(<CardBody card={card("sponsors")} city="Guadalajara" />);
    expect(screen.getByText("Cerro Alto Mezcal")).toBeTruthy();
    expect(screen.queryByText("Lúpulo Tapatío")).toBeNull();
    expect(screen.getByText("+5 more")).toBeTruthy();
  });
  it("co-billing shows both lift factors", () => {
    render(<CardBody card={card("co_billing")} city="Guadalajara" />);
    expect(screen.getByText("0.34 × 0.88 = 0.30")).toBeTruthy();
    expect(screen.getByText("lift = shared taste × local affinity")).toBeTruthy();
  });
  it("talent shows shared taste, tags and the proxy list", () => {
    render(<CardBody card={card("talent")} city="Guadalajara" />);
    expect(screen.getByText("Shared taste with Guadalajara's mainstream: 0.12")).toBeTruthy();
    expect(screen.getByText("dream pop")).toBeTruthy();
    expect(screen.getByText("City mainstream = top artists in the city without the artist signal")).toBeTruthy();
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
    render(<CardBody card={{ ...card("venue_fit"), status: "empty", items: [] }} city="Curitiba" />);
    expect(screen.getByText("Qloo returned no venue fit for Curitiba")).toBeTruthy();
  });
  it("labels the merch creative direction as a model suggestion", () => {
    render(<CardBody card={card("merch")} merch={narrative.status === "ok" ? narrative.merch : null} city="Guadalajara" />);
    expect(screen.getByText("Jacaranda season")).toBeTruthy();
    expect(screen.getByText("Creative direction — model suggestion, not Qloo data")).toBeTruthy();
    expect(screen.getByText("Inspired by")).toBeTruthy();
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
});
