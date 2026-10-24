import { describe, expect, it } from "vitest";
import fixture from "@/test/fixtures/showcase.synthetic.json";
import { PLACEHOLDER_SHOWCASE } from "./placeholderShowcase";
import { parseShowcase, showcaseCities } from "./showcase";
import { storyBeats } from "./story";

const show = parseShowcase(fixture);

describe("storyBeats", () => {
  it("names the hidden goldmine city the fan-density ranking misses", () => {
    const b = storyBeats(show)!;
    const goldmine = showcaseCities(show).find((c) => c.verdict === "hidden_goldmine")!;
    expect(b.missed.city).toBe(goldmine.name);
    expect(b.plan.city).toBe(goldmine.name);
    expect(b.missed.densityRank).toBeGreaterThan(b.missed.winnabilityRank);
    expect(b.missed.verdictLabel).toBe("Hidden goldmine");
  });
  it("counts the scored markets and carries the brief", () => {
    const b = storyBeats(show)!;
    expect(b.decision.markets).toBe(show.boardEvents.filter((e) => e.type === "city_scored").length);
    expect(b.decision.artist).toBe(show.artist);
    expect(b.decision.regions).toEqual(show.brief.regions);
  });
  it("names the playbook's Support (first co-billing item), never the Talent card's local act", () => {
    const b = storyBeats(show)!;
    const cards = show.playbooks[showcaseCities(show).find((c) => c.name === b.missed.city)!.id]!.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : []));
    const co = cards.find((c) => c.kind === "co_billing")!.items[0]!.name;
    const talent = cards.find((c) => c.kind === "talent")!.items[0]!.name;
    expect(co).not.toBe(talent);
    expect(b.plan.coBill).toBe(co);
    expect(b.plan).not.toHaveProperty("localAct");
  });
  it("reads the playbook's first sponsor and co-bill", () => {
    const b = storyBeats(show)!;
    const cards = show.playbooks[showcaseCities(show).find((c) => c.name === b.missed.city)!.id]!.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : []));
    const first = (k: string) => cards.find((c) => c.kind === k)?.items[0]?.name ?? null;
    expect(b.plan).toMatchObject({ sponsor: first("sponsors"), coBill: first("co_billing") });
  });
  it("is null for the placeholder", () => {
    expect(storyBeats(parseShowcase(PLACEHOLDER_SHOWCASE))).toBeNull();
  });
  it("ignores a card whose status is empty, even when it carries items", () => {
    const goldId = showcaseCities(show).find((c) => c.verdict === "hidden_goldmine")!.id;
    const copy = parseShowcase(JSON.parse(JSON.stringify(fixture)));
    for (const e of copy.playbooks[goldId]!) if (e.type === "playbook") for (const c of e.playbook.cards) if (c.kind === "sponsors") c.status = "empty";
    const b = storyBeats(copy)!;
    expect(b.plan.sponsor).toBeNull();
    expect(b.plan.coBill).not.toBeNull();
  });
  it("returns null plan fields when the missed city has no playbook", () => {
    const goldId = showcaseCities(show).find((c) => c.verdict === "hidden_goldmine")!.id;
    const copy = parseShowcase(JSON.parse(JSON.stringify(fixture)));
    delete copy.playbooks[goldId];
    expect(storyBeats(copy)!.plan).toMatchObject({ sponsor: null, coBill: null });
  });
});
