import { afterEach, beforeEach, describe, expect, it } from "vitest";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { SAMPLE_CITIES } from "./fixtures/lumenVale";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { journeyLinks, runKey, stepOf, STEPS } from "./journey";
import type { ScoredCity } from "./types";
import { defaultShortlist, sortCities } from "./ranking";
import { parseShowcase, setShowcase, setShowcaseVariant, showcaseCities, showcasePlaybookEvents } from "./showcase";

describe("stepOf", () => {
  it("maps the four journey routes and nothing else", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["Markets", "Decide", "Playbook", "Tour Book"]);
    expect(stepOf("/")).toBe("markets");
    expect(stepOf("/tours/board")).toBe("decide");
    expect(stepOf("/tours/playbook/123")).toBe("playbook");
    expect(stepOf("/tours/book")).toBe("book");
    for (const off of ["/insights", "/proof", "/nowhere"]) expect(stepOf(off)).toBeNull();
  });
});

describe("runKey", () => {
  it("is stable for a run and differs between runs", () => {
    expect(runKey("showcase", undefined, "Mac DeMarco")).toBe(runKey("showcase", undefined, "Mac DeMarco"));
    expect(runKey("showcase", undefined, "Mac DeMarco")).not.toBe(runKey("sample", "default", "Mac DeMarco"));
  });
});

describe("journeyLinks", () => {
  beforeEach(() => setShowcase(parseShowcase(syntheticShowcase)));
  afterEach(() => setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)));
  const idle = { status: "idle" as const, source: "live" as const, cities: [], shortlist: [], lastOpenedId: null };
  const recorded = () => sortCities(showcaseCities(), "winnability").filter((c) => showcasePlaybookEvents(c.id) !== null);

  it("with no run every later step opens the showcase example, never a stranded page", () => {
    const l = journeyLinks(idle);
    expect(l.markets).toBe("/");
    expect(l.decide).toBe("/tours/board?showcase=1");
    expect(l.book).toBe("/tours/book?showcase=1");
    expect(l.playbook).toBe(`/tours/playbook/${recorded()[0]!.id}?showcase=1`);
  });
  it("falls back to the invented sample when no recording loaded", () => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
    const l = journeyLinks(idle);
    expect(l.decide).toBe("/tours/board?sample=1");
    expect(l.playbook).toMatch(/^\/tours\/playbook\/\d+\?sample=1$/);
  });
  describe("playbook target", () => {
    // Read at test time: the recording is swapped in by beforeEach.
    let run!: { status: "done"; source: "showcase"; cities: ScoredCity[] };
    let rec!: ScoredCity[];
    beforeEach(() => { run = { status: "done", source: "showcase", cities: showcaseCities() }; rec = recorded(); });
    it("prefers the last-opened city", () => {
      const l = journeyLinks({ ...run, shortlist: [rec[0]!.id], lastOpenedId: rec[1]!.id });
      expect(l.playbook).toBe(`/tours/playbook/${rec[1]!.id}?showcase=1`);
    });
    it("else the first held city that has a playbook", () => {
      const withoutRec = showcaseCities().find((c) => showcasePlaybookEvents(c.id) === null);
      const l = journeyLinks({ ...run, shortlist: [withoutRec!.id, rec[1]!.id, rec[0]!.id], lastOpenedId: null });
      expect(l.playbook).toBe(`/tours/playbook/${rec[1]!.id}?showcase=1`);
    });
    it("else the top-ranked city of the run", () => {
      const l = journeyLinks({ ...run, shortlist: [], lastOpenedId: null });
      expect(l.playbook).toBe(`/tours/playbook/${rec[0]!.id}?showcase=1`);
    });
    it("ignores a last-opened city that is not in this run", () => {
      const l = journeyLinks({ ...run, shortlist: [], lastOpenedId: "nope" });
      expect(l.playbook).toBe(`/tours/playbook/${rec[0]!.id}?showcase=1`);
    });
  });
  it("a live run keeps clean urls and opens any city", () => {
    const cities = SAMPLE_CITIES;
    const l = journeyLinks({ status: "done", source: "live", cities, shortlist: defaultShortlist(cities, 8), lastOpenedId: null });
    expect(l.decide).toBe("/tours/board");
    expect(l.book).toBe("/tours/book");
    expect(l.playbook).toBe(`/tours/playbook/${defaultShortlist(cities, 8)[0]}`);
  });
  it("keeps the long sample flag", () => {
    const l = journeyLinks({ status: "done", source: "sample", sampleSet: "long", cities: SAMPLE_CITIES, shortlist: [], lastOpenedId: null });
    expect(l.decide).toBe("/tours/board?sample=long");
  });
  it("a run that has no scored city yet sends Playbook to the board", () => {
    const l = journeyLinks({ status: "streaming", source: "live", cities: [], shortlist: [], lastOpenedId: null });
    expect(l.playbook).toBe("/tours/board");
  });
});

describe("journeyLinks for the recorded routing", () => {
  beforeEach(() => { setShowcase(parseShowcase(syntheticShowcase)); setShowcaseVariant("routing"); });
  afterEach(() => { setShowcaseVariant("main"); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); });
  it("a routing run keeps ?showcase=routing on every step, and Playbook leads to a city with a recorded playbook", () => {
    const cities = showcaseCities();
    const l = journeyLinks({ status: "done", source: "showcase", sampleSet: "showcase", routing: true, cities, shortlist: cities.map((c) => c.id), lastOpenedId: null });
    expect(l.decide).toBe("/tours/board?showcase=routing");
    expect(l.book).toBe("/tours/book?showcase=routing");
    const id = l.playbook.match(/playbook\/([^?]+)/)![1]!;
    expect(showcasePlaybookEvents(id)).not.toBeNull();
    expect(l.playbook.endsWith("?showcase=routing")).toBe(true);
  });
  it("the main run keeps ?showcase=1", () => {
    setShowcaseVariant("main");
    const cities = showcaseCities();
    expect(journeyLinks({ status: "done", source: "showcase", sampleSet: "showcase", cities, shortlist: [], lastOpenedId: null }).decide).toBe("/tours/board?showcase=1");
  });
});

