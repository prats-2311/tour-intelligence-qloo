// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { TourProvider } from "@/components/tour/TourProvider";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { resetPlaybooks } from "@/lib/qloo/playbookStore";
import { parseShowcase, setShowcase, SHOWCASE } from "@/lib/qloo/showcase";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { TOUR_STORAGE_KEY } from "@/lib/tour/tourStorage";
import { BRAND_CATEGORY, categoryOf, isFoodPlace, isNoGo, loadTasteLoop } from "@/lib/v2/tasteLoop";
import { buildExperiences } from "@/lib/v2/experiences";
import { buildV2TourSteps, V2_TOUR_STEP_COUNT } from "@/lib/tour/v2TourSteps";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import Landing from "./Landing";
import V2Preview from "./V2Preview";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

const SPONSORS = ["Stüssy", "OBEY", "Kith", "HUF", "Off-white", "Fear Of God", "Y-3"];
const VENUES = ["The Moroccan Lounge", "REDCAT ROY AND EDNA DISNEY/CALARTS THEATER", "The Smell"];

/** The synthetic recording with its first playbook relabelled as Los Angeles and filled with the recorded LA sponsor and venue names. */
function laShowcase() {
  const raw = JSON.parse(JSON.stringify(syntheticShowcase));
  const id = Object.keys(raw.playbooks)[0]!;
  for (const e of raw.boardEvents) if (e.type === "city_scored" && e.city.id === id) e.city.name = "Los Angeles";
  for (const e of raw.playbooks[id]) {
    if (e.type !== "playbook") continue;
    for (const c of e.playbook.cards) {
      const proto = c.items[0] ?? {};
      if (c.kind === "sponsors") c.items = SPONSORS.map((name, i) => ({ ...proto, name, artistRank: i + 1, cityRank: null }));
      if (c.kind === "venue_fit") c.items = VENUES.map((name, i) => ({ ...proto, name, category: "place", affinity: 0.94 - i / 100 }));
      if (c.kind === "co_billing" && c.items.length) c.items = [{ ...c.items[0], name: "Ariel Pink" }, ...c.items];
    }
  }
  raw.artist = "Mac DeMarco";
  raw.recordedAt = "2026-10-28T09:52:30.982Z";
  return raw;
}

beforeEach(() => {
  window.localStorage.clear();
  setShowcase(parseShowcase(laShowcase()));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: !q.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function () { return [{ width: 10, height: 10 }] as unknown as DOMRectList; });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ top: 100, left: 100, width: 200, height: 80, right: 300, bottom: 180, x: 100, y: 100, toJSON() {} }));
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollBy = vi.fn();
});
afterEach(() => {
  cleanup();
  resetPlaybooks();
  setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = (url = "/v2") => render(
  <QueryClientProvider client={new QueryClient()}>
    <TourBoardProvider>
      <MemoryRouter initialEntries={[url]}>
        <TourProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/v2" element={<V2Preview />} />
            </Routes>
          </AppShell>
        </TourProvider>
      </MemoryRouter>
    </TourBoardProvider>
  </QueryClientProvider>,
);

describe("/v2 concept preview", () => {
  it("never offers an act on the do-not-book list", () => {
    mount();
    expect(document.body.textContent).not.toMatch(/Ariel Pink/);
  });

  it("is labelled as a concept and the profile as fictional", () => {
    mount();
    expect(screen.getByText("Concept preview — not built yet")).toBeTruthy();
    expect(screen.getAllByText("Fictional example").length).toBeGreaterThan(0);
    expect(screen.getByText("Mac DeMarco", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText(/Real Qloo data: fans of Mac DeMarco in Los Angeles, recorded 28 Oct 2026/)).toBeTruthy();
  });

  it("crosses out a no-go brand that is in the recorded sponsors list", () => {
    mount();
    const crossed = screen.getAllByTestId("no-go-item");
    expect(crossed.length).toBeGreaterThan(0);
    const row = crossed[0]!.closest("li")!;
    const name = SPONSORS.find((s) => row.textContent?.includes(s))!;
    expect(name).toBe("Off-white");
    const recorded = Object.values(SHOWCASE.playbooks).flat().flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])).filter((c) => c.kind === "sponsors").flatMap((c) => c.items.map((i) => i.name));
    expect(recorded).toContain(name);
    expect(within(row).getByText(/Artist's no-go list/)).toBeTruthy();
    expect(categoryOf(name)).toBe("Luxury fashion");
    // The match draws only on brands that are not crossed out for the suggestion.
    expect(screen.getByRole("heading", { level: 2, name: /Listening session at The Moroccan Lounge/ })).toBeTruthy();
    expect(screen.getByTestId("outreach-draft").textContent).not.toContain("Off-white");
  });

  it("shows No data yet for every outcome metric and never a percent sign", () => {
    const { container } = mount();
    expect(screen.getAllByText("No data yet — v2 collects this")).toHaveLength(4);
    expect(container.querySelector("[data-tour='v2-outcome']")!.textContent).not.toContain("%");
    expect(container.textContent).not.toContain("%");
  });

  it("mocks the RSVP card with disabled buttons", () => {
    mount();
    for (const t of ["Going", "Waitlist", "I was there"]) expect((screen.getByRole("button", { name: t }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has no active journey step", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-step][data-state='current']")).toHaveLength(0);
    expect(container.querySelectorAll("[data-step] [aria-current='page']")).toHaveLength(0);
  });

  it("leaves every venue intent field blank for the venue to answer, never a made-up value", () => {
    const { container } = mount();
    const lines = [...container.querySelectorAll("[data-tour='v2-venues'] li")].map((li) => li.textContent ?? "").filter((t) => /^(Open to collabs|Room size|Free nights)/.test(t));
    expect(lines).toHaveLength(VENUES.length * 3);
    for (const t of lines) expect(t).toMatch(/\? \(the venue answers\)$/);
  });

  it("has every section the tour points at", () => {
    const { container } = mount();
    for (const id of ["hero", "profile", "venues", "match", "act", "experiences", "rsvp", "outcome", "loop", "compare"]) expect(container.querySelector(`[data-tour='v2-${id}']`)).toBeTruthy();
  });
});

describe("Fan experiences section", () => {
  const MONEY = /[$€£%]|R\$/;
  it("renders after Act and before Fans prove it, with later sections renumbered", () => {
    const { container } = mount();
    const ids = [...container.querySelectorAll("[data-tour]")].map((e) => e.getAttribute("data-tour"));
    expect(ids.indexOf("v2-experiences")).toBe(ids.indexOf("v2-act") + 1);
    expect(ids.indexOf("v2-rsvp")).toBe(ids.indexOf("v2-experiences") + 1);
    expect(screen.getByText("5 · Experiences")).toBeTruthy();
    expect(screen.getByText("6 · Fans prove it")).toBeTruthy();
    expect(screen.getByText("9 · V1 today vs V2")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Experiences fans could book" })).toBeTruthy();
    expect(container.querySelector("[data-tour='v2-experiences']")!.textContent).toContain("Prices and capacity are set by the artist and the venue.");
    expect(screen.getByTestId("how-selling-works").querySelectorAll("li")).toHaveLength(4);
  });

  it("lists seven types, opens one at a time by keyboard-reachable buttons, each with a 6-step ordered journey", () => {
    const { container } = mount();
    const section = container.querySelector("[data-tour='v2-experiences']") as HTMLElement;
    const buttons = within(section).getAllByRole("button");
    expect(buttons).toHaveLength(7);
    buttons.forEach((b, i) => {
      if (b.getAttribute("aria-expanded") !== "true") fireEvent.click(b);
      expect(buttons.filter((x) => x.getAttribute("aria-expanded") === "true")).toHaveLength(1);
      expect(b.getAttribute("aria-expanded")).toBe("true");
      const panel = document.getElementById(b.getAttribute("aria-controls")!)!;
      expect(panel.querySelector("ol")!.tagName).toBe("OL");
      expect(within(panel).getAllByTestId("journey-step")).toHaveLength(6);
      expect(panel.textContent).toMatch(/Free|Paid \(price set by artist and venue\)/);
      expect(i).toBeGreaterThanOrEqual(0);
    });
  });

  it("binds the real-data chips to items in the recording", () => {
    const d = loadTasteLoop(SHOWCASE);
    const cards = Object.values(SHOWCASE.playbooks).flat().flatMap((e) => (e.type === "playbook" ? e.playbook.cards : []));
    const names = (k: string) => cards.filter((c) => c.kind === k).flatMap((c) => c.items.map((i) => String(i.name ?? i.label)));
    const ex = Object.fromEntries(buildExperiences(d).map((x) => [x.id, x.example]));
    expect(ex.listening).toBe("The Moroccan Lounge");
    expect(names("venue_fit")).toContain(ex.listening);
    expect(ex.popup).toBe("Stüssy");
    expect(names("sponsors")).toContain(ex.popup);
    expect(names("local_moment")).toContain(ex.film);
    expect(ex.film).toMatch(/Movie/);
    expect(names("co_billing")).toContain(ex.opener);
    expect(names("promo_zones")).toContain(ex.walk);
    expect(ex.soundcheck).toBeNull();
    expect(ex.dinner).toBeNull();
    const { container } = mount();
    const chips = within(container.querySelector("[data-tour='v2-experiences']") as HTMLElement).getAllByText(/Real Qloo data, recorded 28 Oct 2026/);
    expect(chips.length).toBeGreaterThan(0);
  });

  it("uses a real place for the dinner only when its name says food", () => {
    expect(isFoodPlace("Guisados Tacos")).toBe(true);
    expect(isFoodPlace("The Smell")).toBe(false);
    const d = { ...loadTasteLoop(SHOWCASE), foodPlace: "Guisados Tacos" };
    expect(buildExperiences(d).find((x) => x.id === "dinner")!.example).toBe("Guisados Tacos");
  });

  it("never shows a percent sign or currency symbol, in any experience", () => {
    const { container } = mount();
    expect(container.textContent).not.toMatch(MONEY);
    const all = JSON.stringify(buildExperiences(loadTasteLoop(SHOWCASE)));
    expect(all).not.toMatch(MONEY);
    expect(JSON.stringify(buildExperiences({ ...loadTasteLoop(SHOWCASE), real: false, film: null, coBill: null, zone: null, topPlace: null, topBrand: null }))).not.toMatch(MONEY);
  });
});

describe("no-go category map", () => {
  it("only excludes brands whose category is on the list", () => {
    expect(isNoGo("Off-white")).toBe(true);
    expect(isNoGo("Fear Of God")).toBe(true);
    expect(isNoGo("Stüssy")).toBe(false);
    expect(isNoGo("Off-white", ["Sportswear"])).toBe(false);
    expect(Object.values(BRAND_CATEGORY).every((c) => c === "Luxury fashion")).toBe(true);
  });
});

describe("v2 tour", () => {
  const popover = () => screen.getByTestId("tour-popover");
  it("does not prompt, starts from the button, walks every step and stores only the v2 key", async () => {
    mount();
    expect(screen.queryByTestId("tour-prompt")).toBeNull();
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    expect(screen.getByText(`1 of ${V2_TOUR_STEP_COUNT}`)).toBeTruthy();
    for (let i = 1; i < V2_TOUR_STEP_COUNT; i++) {
      await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Next" })); });
      expect(screen.getByText(`${i + 1} of ${V2_TOUR_STEP_COUNT}`)).toBeTruthy();
    }
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Done" })); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.v2")).toBe("completed");
  });

  it("Skip and Esc end it without touching the v1 key", async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Next" })); });
    await act(async () => { fireEvent.click(within(popover()).getByRole("button", { name: "Skip" })); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("take-v2-tour")); });
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByTestId("tour-popover")).toBeNull();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem("tiq.tour.v2")).toBe("dismissed");
  });
});

describe("landing link", () => {
  it("offers the concept preview after the proof link", () => {
    mount("/");
    const link = screen.getByRole("link", { name: /Preview: what's next \(concept\)/ });
    expect(link.getAttribute("href")).toBe("/v2");
  });
});

describe("V2Preview prototype taps", () => {
  const stats = (over: object = {}) => ({ enabled: true, since: "2026-10-30T00:00:00.000Z", taps: 20, byAction: { going: 12, waitlist: 3, was_there: 5 }, byExperience: {}, ...over });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  function stubGateway(statsBody: unknown) {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/qloo/stats/v2")) return json(statsBody);
      if (u.includes("/api/qloo/v2/tap")) return json({ enabled: true, ok: true }, 202);
      void init;
      return json({}, 404);
    });
    vi.stubGlobal("fetch", f);
    return f;
  }
  const taps = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).includes("/v2/tap"));

  it("keeps the mock, disabled buttons and No data yet everywhere when stats are off", async () => {
    stubGateway({ enabled: false });
    const { container } = mount();
    await act(async () => { await Promise.resolve(); });
    for (const t of ["Going", "Waitlist", "I was there"]) expect((screen.getByRole("button", { name: t }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Mock — not live").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No data yet — v2 collects this")).toHaveLength(4);
    expect(container.textContent).not.toContain("Prototype taps");
    expect(container.textContent).toContain("Mock — not live. The buttons do nothing and nothing is sent.");
  });

  it("enables the buttons when stats are on, labels them as a prototype and posts once per action", async () => {
    const f = stubGateway(stats());
    const { container } = mount();
    const going = await screen.findByRole("button", { name: "Going" }) as HTMLButtonElement;
    await vi.waitFor(() => expect(going.disabled).toBe(false));
    expect(container.textContent).toContain("Prototype: taps from visitors of this page, not real fans. Stored as anonymous counts in BigQuery.");
    await act(async () => { fireEvent.click(going); });
    await vi.waitFor(() => expect(going.disabled).toBe(true));
    fireEvent.click(going);
    expect(taps(f)).toHaveLength(1);
    expect(JSON.parse(String((taps(f)[0]![1] as RequestInit).body))).toEqual({ action: "going", experience: "listening" });
    expect(JSON.parse(window.localStorage.getItem("tiq.v2.taps")!)).toEqual(["going"]);
    expect((screen.getByRole("button", { name: "Waitlist" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("starts with an action already tapped in this browser disabled", async () => {
    window.localStorage.setItem("tiq.v2.taps", JSON.stringify(["waitlist"]));
    stubGateway(stats());
    mount();
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Going" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole("button", { name: "Waitlist" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows prototype ratios as 'N of M' with raw counts and the label, and never a percent sign", async () => {
    stubGateway(stats());
    const { container } = mount();
    await screen.findByTestId("prototype-counts");
    const out = container.querySelector("[data-tour='v2-outcome']")!;
    expect(screen.getByTestId("prototype-counts").textContent).toContain("Going 12 · Waitlist 3 · I was there 5");
    expect(out.textContent).toContain("12 of 15 RSVP taps were Going");
    expect(out.textContent).toContain("5 I was there taps for 12 Going");
    expect(out.textContent).toContain("Prototype taps, not real fans");
    expect(screen.getAllByText("No data yet — needs real venues and artists")).toHaveLength(2);
    expect(container.textContent).not.toContain("%");
  });

  it("says no taps yet when enabled with zero taps", async () => {
    stubGateway(stats({ taps: 0, byAction: { going: 0, waitlist: 0, was_there: 0 } }));
    mount();
    await screen.findByTestId("prototype-counts");
    expect(screen.getAllByText("No taps yet")).toHaveLength(2);
  });

  it("a failed tap says so and can be retried", async () => {
    const f = vi.fn(async (url: string | URL | Request) => (String(url).includes("stats/v2") ? json(stats()) : json({ error: "x" }, 502)));
    vi.stubGlobal("fetch", f);
    mount();
    const going = await screen.findByRole("button", { name: "Going" }) as HTMLButtonElement;
    await vi.waitFor(() => expect(going.disabled).toBe(false));
    await act(async () => { fireEvent.click(going); });
    await screen.findByText(/did not go through/);
    expect(going.disabled).toBe(false);
    expect(window.localStorage.getItem("tiq.v2.taps")).toBeNull();
  });

  it("tour Match step names every crossed-out brand, joined naturally, from the same data as the page", () => {
    const crossed = loadTasteLoop(SHOWCASE).brands.filter((b) => b.noGo).map((b) => b.name);
    expect(crossed).toEqual(["Off-white", "Fear Of God"]);
    const match = buildV2TourSteps(SHOWCASE).find((st) => st.id === "match")!;
    expect(match.body).toContain("Off-white and Fear Of God are crossed out because they're on the artist's no-go list.");
  });
});
