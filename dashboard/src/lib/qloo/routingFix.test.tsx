// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { getPlaybook, loadPlaybook, playbookKey, resetPlaybooks } from "./playbookStore";
import { journeyLinks, runKey } from "./journey";
import { effectiveRegions, parsePastedCities } from "./routing";
import { parseShowcase, setShowcase, setShowcaseVariant, showcaseBrief, showcaseCities, showcasePlaybookEvents } from "./showcase";
import { campaignTitle } from "./tourBook";
import type { GatewayEvent } from "./types";

const base = parseShowcase(syntheticShowcase);
const overlapId = Object.keys(base.routing!.playbooks).find((id) => base.playbooks[id])!;
const marker = (name: string): GatewayEvent[] => [{ type: "error", code: "MARK", message: name }];
/** The synthetic fixture with distinguishable recorded playbooks for the one city both examples cover. */
const tagged = () => parseShowcase({ ...(syntheticShowcase as object), playbooks: { ...base.playbooks, [overlapId]: marker("main") }, routing: { ...base.routing!, playbooks: { ...base.routing!.playbooks, [overlapId]: marker("routing") } } });

afterEach(() => { resetPlaybooks(); setShowcaseVariant("main"); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); });

describe("variant isolation", () => {
  const req = (variant?: "routing") => ({ artist: "A", artistEntityId: "E1", city: { id: overlapId, name: "X", country: "US" }, sample: true, sampleSet: "showcase" as const, delayMs: 0, ...(variant ? { variant } : {}) });

  it("accessors take an explicit variant and ignore the URL-driven global", () => {
    setShowcase(tagged());
    setShowcaseVariant("main");
    expect(showcasePlaybookEvents(overlapId, "routing")).toEqual(marker("routing"));
    expect(showcasePlaybookEvents(overlapId, "main")).toEqual(marker("main"));
    expect(showcaseCities(undefined, "routing").every((c) => c.candidateSource === "your_routing")).toBe(true);
  });
  it("the same city in both examples keeps its own recorded playbook in the cache", async () => {
    setShowcase(tagged());
    await loadPlaybook(req());
    await loadPlaybook(req("routing"));
    expect(playbookKey("E1", overlapId, "showcase")).not.toBe(playbookKey("E1", overlapId, "showcase", "routing"));
    expect(getPlaybook(playbookKey("E1", overlapId, "showcase"))?.error?.message).toBe("main");
    expect(getPlaybook(playbookKey("E1", overlapId, "showcase", "routing"))?.error?.message).toBe("routing");
  });
  it("the run key differs between the main example and the routing example", () => {
    expect(runKey("showcase", "showcase", "A")).not.toBe(runKey("showcase", "showcase", "A", true));
  });
  it("with a routing run loaded on / (URL variant main), the Playbook step links to a city that has a routing playbook", () => {
    setShowcase(tagged());
    setShowcaseVariant("main");
    const routingCities = showcaseCities(undefined, "routing");
    const mainOnly = Object.keys(base.playbooks).filter((id) => !base.routing!.playbooks[id]);
    expect(mainOnly.length).toBeGreaterThan(0);
    const links = journeyLinks({ status: "done", source: "showcase", sampleSet: "showcase", routing: true, cities: routingCities, shortlist: [...mainOnly, ...routingCities.map((c) => c.id)], lastOpenedId: mainOnly[0]! });
    const id = links.playbook.match(/playbook\/([^?]+)/)![1]!;
    expect(showcasePlaybookEvents(id, "routing")).not.toBeNull();
    expect(links.playbook.endsWith("?showcase=routing")).toBe(true);
  });
});

describe("regions of a pasted run", () => {
  it("the recorded routing's brief names its own countries, not the main run's regions", () => {
    setShowcase(base);
    setShowcaseVariant("routing");
    const regions = showcaseBrief().regions;
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).toEqual(["United States", "Brazil"]);
    expect(regions).not.toContain("Mexico");
  });
  it("effectiveRegions: distinct country names of the scored cities for a pasted brief, the brief's regions otherwise", () => {
    const cs = [{ country: "MX" }, { country: "US" }, { country: "MX" }] as never;
    expect(effectiveRegions({ regions: [], cities: [{ name: "A" }] }, cs)).toEqual(["Mexico", "United States"]);
    expect(effectiveRegions({ regions: ["Brazil"] }, cs)).toEqual(["Brazil"]);
    expect(effectiveRegions({ regions: [], cities: [{ name: "A" }] }, [])).toEqual([]);
  });
  it("a campaign title never ends in a dangling dash", () => {
    expect(campaignTitle("Artist", [])).toBe("Artist");
    expect(campaignTitle("Artist", ["Mexico"])).toBe("Artist — Mexico");
  });
});

describe("parsePastedCities country recognition", () => {
  it("a trailing part that is not a country or ISO-2 code stays in the city name", () => {
    expect(parsePastedCities("Washington, D.C.").cities).toEqual([{ name: "Washington, D.C." }]);
    expect(parsePastedCities("Portland, Oregon").cities).toEqual([{ name: "Portland, Oregon" }]);
    expect(parsePastedCities("Atlantis, ZZ").cities).toEqual([{ name: "Atlantis, ZZ" }]);
  });
  it("ISO-2 codes, English country names and USA/UK are countries (any case, accents folded)", () => {
    expect(parsePastedCities("Portland, us\nMexico City, Mexico\nLeeds, UK\nAustin, USA\nWashington, D.C., US").cities).toEqual([
      { name: "Portland", country: "us" }, { name: "Mexico City", country: "Mexico" }, { name: "Leeds", country: "UK" }, { name: "Austin", country: "USA" }, { name: "Washington, D.C.", country: "US" },
    ]);
  });
});
