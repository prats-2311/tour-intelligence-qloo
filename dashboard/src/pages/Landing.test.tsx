// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sortCities } from "@/lib/qloo/ranking";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY } from "@/lib/qloo/labels";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { ordinal } from "@/lib/qloo/ranking";
import { parseShowcase, SHOWCASE, setShowcase, showcaseCities } from "@/lib/qloo/showcase";
import { storyBeats } from "@/lib/qloo/story";
import Landing from "./Landing";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Landing", () => {
  it("has the headline and both entry points", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Win their city." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try the showcase tour" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.getByRole("link", { name: "Plan your own" }).getAttribute("href")).toBe("/tours/board");
  });
  it("labels the proof card with the verbatim sample banner and integrity line, and shows no LIVE badge", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Guadalajara sample routing row" });
    expect(within(card).getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
    expect(within(card).getByText("Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.")).toBeTruthy();
    expect(screen.queryByText("Affinity signal from aggregate taste data — not a ticket forecast.")).toBeNull();
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
  });
  it("the Guadalajara proof card links to its sample playbook", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Guadalajara/ }).getAttribute("href")).toBe("/tours/playbook/4005539?sample=1");
  });
  it("shows the fixture's winnability, never a filler", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Guadalajara sample routing row" });
    expect(within(card).getByTestId("proof-winnability").textContent).toBe(String(Math.round(SAMPLE_CITIES[2]!.winnability.value!)));
  });
  it("shows the Guadalajara fragment from the sample fixture and omits the backtest link", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Guadalajara")).toBeTruthy();
    expect(screen.getByText("Ranked 6th on fan density alone. 3rd on winnability.")).toBeTruthy();
    expect(screen.getByText("Hidden goldmine")).toBeTruthy();
    expect(screen.queryByText(/backtest/i)).toBeNull();
  });
  it("derives the rank line from the fixture", () => {
    const id = SAMPLE_CITIES[2]!.id;
    const rank = (m: "density" | "winnability") => sortCities(SAMPLE_CITIES, m).findIndex((c) => c.id === id) + 1;
    expect([rank("density"), rank("winnability")]).toEqual([6, 3]);
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Ranked 6th on fan density alone. 3rd on winnability.")).toBeTruthy();
  });
  it("desktop branch: map region is aria-hidden and no LIVE text", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(container.querySelector('[aria-hidden="true"][inert]')).toBeTruthy();
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
  });
});

describe("Landing hero default thresholds", () => {
  it("a recording without a scoring event keeps the default thresholds", () => {
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    const t = DEFAULT_SCORING_DISPLAY.thresholds;
    const lefts = [...container.querySelectorAll<HTMLElement>("span[aria-hidden].absolute")].map((s) => s.style.left);
    expect(lefts).toEqual([t.goldmineFanMin, t.playFan, t.deRiskAct, t.playAct, t.goldmineAct].map((v) => `${v}%`));
  });
  it("links to the proof page", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Checked against real tours/ }).getAttribute("href")).toBe("/proof");
  });
});

const goldId = () => showcaseCities(parseShowcase(syntheticShowcase)).find((c) => c.verdict === "hidden_goldmine")!.id;
const editCards = (fn: (c: { kind: string; status: string }) => void) => {
  const copy = parseShowcase(JSON.parse(JSON.stringify(syntheticShowcase)));
  for (const e of copy.playbooks[goldId()]!) if (e.type === "playbook") e.playbook.cards.forEach(fn as never);
  setShowcase(copy);
};
const renderBeats = () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  return within(screen.getByRole("list", { name: "The story in three beats" })).getAllByRole("listitem");
};

describe("Landing story beats (spec 1.2b rule 1: every number comes from the recording)", () => {
  afterEach(() => setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)));
  it("shows the markets, city, both ranks, sponsor and bill taken from storyBeats(SHOWCASE), each in its own beat", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const beats = storyBeats(SHOWCASE)!;
    expect(beats.plan.sponsor).not.toBeNull();
    const [hold, missed, plan] = renderBeats().map((li) => li.textContent!);
    expect(hold).toContain(`${beats.decision.markets} markets`);
    expect(missed).toContain(beats.missed.city);
    expect(missed).toContain(`${ordinal(beats.missed.densityRank)} on fan density`);
    expect(missed).toContain(`${ordinal(beats.missed.winnabilityRank)} on winnability`);
    expect(missed).toContain(beats.missed.verdictLabel);
    expect(plan).toContain(beats.plan.sponsor!);
    const bill = beats.plan.localAct ?? beats.plan.coBill;
    if (bill) expect(plan).toContain(bill);
  });
  it("degrades to the generic playbook line when the city has no playbook", () => {
    const copy = parseShowcase(JSON.parse(JSON.stringify(syntheticShowcase)));
    delete copy.playbooks[goldId()];
    setShowcase(copy);
    expect(renderBeats()[2]!.textContent).toContain("Its playbook: sponsor, venue and promo plan.");
  });
  it("drops only the pitch clause when the sponsor is missing, and only the bill clause when there is no act", () => {
    editCards((c) => { if (c.kind === "sponsors") c.status = "empty"; });
    let plan = renderBeats()[2]!.textContent!;
    expect(plan).not.toContain("pitch");
    expect(plan).toContain("on the bill");
    cleanup();
    editCards((c) => { if (c.kind === "talent" || c.kind === "co_billing") c.status = "empty"; });
    plan = renderBeats()[2]!.textContent!;
    expect(plan).toContain("pitch");
    expect(plan).not.toContain("on the bill");
  });
  it("on mobile the CTAs come before the beats, and the beats before the proof card", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderBeats();
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const cta = screen.getByRole("link", { name: "Try the showcase tour" });
    const list = screen.getByRole("list", { name: "The story in three beats" });
    const proof = screen.getByTestId("proof-winnability");
    expect(before(cta, list)).toBe(true);
    expect(before(list, proof)).toBe(true);
  });
  it("renders no story with the placeholder, and the sample card stays", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.queryByRole("list", { name: "The story in three beats" })).toBeNull();
    expect(screen.getByRole("region", { name: "Guadalajara sample routing row" })).toBeTruthy();
  });
});
