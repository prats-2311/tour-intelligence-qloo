// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sortCities } from "@/lib/qloo/ranking";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DEFAULT_SCORING_DISPLAY } from "@/lib/qloo/labels";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
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
    expect(screen.getByRole("heading", { level: 1, name: "Know which brands your artist's fans love in each city, before the sponsor meeting." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See the example tour" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.getByRole("link", { name: "Try your own artist" }).getAttribute("href")).toBe("/tours/board?new=1");
  });
  it("says what each try-it entry does", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Type any artist; we build fresh city playbooks on the spot.")).toBeTruthy();
    expect(screen.getByText("Replays a recorded run where a tour's cities were pasted, scored and ordered.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try a routing" })).toBeTruthy();
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  });
  it("states the approved pitch copy verbatim", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("In Los Angeles, Mac DeMarco's fans rank Stüssy #1. It isn't in LA's top 20. Qloo taste data, per city, for every stop on the routing.")).toBeTruthy();
    expect(screen.getByText("Then see which cities to win first: fan heat and winnability for every market.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/city picks|places higher|Route with anything/i);
    expect(screen.getByText("The scenario: venues are holding dates until Friday. Pick which 2 of 5 smaller markets to confirm.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/film press tour/i);
    const cta = screen.getByRole("link", { name: "See the example tour" });
    const line = screen.getByTestId("protagonist");
    expect(line.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "How we tested it →" }).getAttribute("href")).toBe("/proof");
  });
  it("never promises a hidden goldmine or says winnability is better, card included", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(container.querySelector("section[aria-label$='routing row']")).toBeTruthy();
    expect(container.querySelector("[aria-label*='oldmine'],[title*='oldmine']")).toBeNull();
    const text = container.textContent!;
    expect(text).not.toMatch(/hidden goldmine|better|outperform|\bbeat|smarter/i);
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  });
  it("the proof card shows the score and both ranks but no verdict chip", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Guadalajara sample routing row" });
    expect(within(card).getByTestId("proof-winnability")).toBeTruthy();
    expect(within(card).queryByText(/Play|Hidden goldmine|De-risk|Consider|Skip/)).toBeNull();
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
    expect(screen.getByText("Fan density ranks it 6th of the 9 with data. Adding winnability puts it 3rd.")).toBeTruthy();
    expect(screen.queryByText(/goldmine/i)).toBeNull();
    expect(screen.queryByText(/backtest/i)).toBeNull();
  });
  it("derives the rank line from the fixture", () => {
    const id = SAMPLE_CITIES[2]!.id;
    const rank = (m: "density" | "winnability") => sortCities(SAMPLE_CITIES, m).findIndex((c) => c.id === id) + 1;
    expect([rank("density"), rank("winnability")]).toEqual([6, 3]);
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText("Fan density ranks it 6th of the 9 with data. Adding winnability puts it 3rd.")).toBeTruthy();
  });
  it("desktop branch: map region is aria-hidden and no LIVE text", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(container.querySelector('[aria-hidden="true"][inert]')).toBeTruthy();
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
  });
  it("desktop: a muted legend under the map names every marker shape from the map's own verdict shapes", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const legend = screen.getByTestId("map-legend");
    expect(legend.textContent).toBe("PlayUnder the radarDe-riskConsiderSkipShape is the verdict, size is fan heat; top picks are named.");
    const marks = [...legend.querySelectorAll("[data-shape]")];
    expect(marks.map((m) => m.getAttribute("data-shape"))).toEqual(["circle", "diamond", "triangle", "ring", "x"].map((x) => x));
    const paint = (m: Element) => m.getAttribute("fill") !== "none" ? m.getAttribute("fill") : m.getAttribute("stroke");
    expect(marks.map(paint)).toEqual(["var(--color-verdict-play)", "var(--color-verdict-goldmine)", "var(--color-verdict-derisk)", "var(--color-verdict-consider)", "var(--color-verdict-skip)"]);
    expect(legend.className).toContain("text-canvas-muted");
  });
  it("phone: no map, so no legend", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.queryByTestId("map-legend")).toBeNull();
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
    expect(screen.getByRole("link", { name: /How we tested it/ }).getAttribute("href")).toBe("/proof");
  });
});

const goldId = () => { const s = parseShowcase(syntheticShowcase); return showcaseCities(s).find((c) => c.name === storyBeats(s)!.mover.city)!.id; };
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
    const [hold, mover, plan] = renderBeats().map((li) => li.textContent!);
    expect(hold).toContain(`${beats.decision.markets} markets`);
    expect(mover).toContain("Worth a second look");
    expect(mover).toContain(`${beats.mover.city} moves #${beats.mover.fanRank} → #${beats.mover.winRank} when you add winnability`);
    expect(mover).not.toMatch(/density|goldmine|miss/i);
    expect(plan).toContain(beats.plan.sponsor!);
    expect(beats.plan.coBill).not.toBeNull();
    expect(plan).toContain(`put ${beats.plan.coBill} on the bill`);
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
    editCards((c) => { if (c.kind === "co_billing") c.status = "empty"; });
    plan = renderBeats()[2]!.textContent!;
    expect(plan).toContain("pitch");
    expect(plan).not.toContain("on the bill");
  });
  it("never prints a do-not-book act in the beats: next act, or no bill clause", () => {
    editCards((c) => { if (c.kind === "co_billing") (c as unknown as { items: unknown[] }).items = [{ name: "Ariel Pink" }, { name: "Synthetic Artist 02" }]; });
    let plan = renderBeats()[2]!.textContent!;
    expect(document.body.textContent).not.toContain("Ariel Pink");
    expect(plan).toContain("put Synthetic Artist 02 on the bill");
    cleanup();
    editCards((c) => { if (c.kind === "co_billing") (c as unknown as { items: unknown[] }).items = [{ name: "Ariel Pink" }]; });
    plan = renderBeats()[2]!.textContent!;
    expect(document.body.textContent).not.toContain("Ariel Pink");
    expect(plan).not.toContain("on the bill");
    expect(plan).toContain("pitch");
  });
  it("on mobile the CTAs come before the beats, and the beats before the proof card", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    renderBeats();
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const cta = screen.getByRole("link", { name: "See the example tour" });
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

describe("Landing Try a routing", () => {
  it("links to the recorded routing under the example tour when the recording has one", () => {
    setShowcase(parseShowcase(syntheticShowcase));
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const example = screen.getByRole("link", { name: "See the example tour" });
    const routing = screen.getByRole("link", { name: "Try a routing" });
    expect(routing.getAttribute("href")).toBe("/tours/board?showcase=routing");
    expect(example.compareDocumentPosition(routing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  });
  it("is hidden without a routing in the recording (placeholder, or an older recording)", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Try a routing" })).toBeNull();
    setShowcase(parseShowcase({ ...(syntheticShowcase as object), routing: undefined }));
    cleanup();
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Try a routing" })).toBeNull();
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  });
});

