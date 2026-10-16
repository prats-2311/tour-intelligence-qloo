import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "./lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS, samplePlaybookEvents, sampleThisWeek } from "./lumenValePlaybooks";
import type { GatewayEvent, PlaybookCard } from "../types";

const cardsOf = (ev: GatewayEvent[]) => (ev.find((e) => e.type === "playbook") as Extract<GatewayEvent, { type: "playbook" }>).playbook.cards;
const narrativeOf = (ev: GatewayEvent[]) => (ev.find((e) => e.type === "narrative") as Extract<GatewayEvent, { type: "narrative" }>).narrative;

describe("sample playbooks", () => {
  it("cover exactly the four Play / Hidden goldmine sample cities", () => {
    const eligible = SAMPLE_CITIES.filter((c) => c.verdict === "play" || c.verdict === "hidden_goldmine").map((c) => c.id);
    expect([...SAMPLE_PLAYBOOK_CITY_IDS].sort()).toEqual(eligible.sort());
  });
  it.each(SAMPLE_PLAYBOOK_CITY_IDS)("city %s streams tool events, playbook, narrative, done with seven cards in order", (id) => {
    const ev = samplePlaybookEvents(id)!;
    expect(ev.at(-3)?.type).toBe("playbook");
    expect(ev.at(-2)?.type).toBe("narrative");
    expect(ev.at(-1)?.type).toBe("done");
    expect(cardsOf(ev).map((c: PlaybookCard) => c.kind)).toEqual(["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing", "talent"]);
  });
  it("every verified sample claim cites an existing card item", () => {
    for (const id of SAMPLE_PLAYBOOK_CITY_IDS) {
      const ev = samplePlaybookEvents(id)!;
      const ids = new Set(cardsOf(ev).flatMap((c) => [...c.items.map((_, i) => `${c.kind}:${i}`), ...(c.kind === "talent" ? ["talent:overlap"] : [])]));
      const n = narrativeOf(ev);
      if (n.status !== "ok") continue;
      for (const cc of Object.values(n.cards)) for (const claim of cc!.verified) for (const r of claim.evidence_refs) expect(ids.has(r)).toBe(true);
    }
  });
  it("Guadalajara matches the brief: 7 verified, 2 removed, co-billing lift 0.34 × 0.88", () => {
    const ev = samplePlaybookEvents("4005539")!;
    const n = narrativeOf(ev);
    if (n.status !== "ok") throw new Error("expected ok");
    const all = Object.values(n.cards);
    expect(all.reduce((s, c) => s + c!.verified.length, 0)).toBe(7);
    expect(all.reduce((s, c) => s + c!.removed.length, 0)).toBe(2);
    const co = cardsOf(ev).find((c) => c.kind === "co_billing")!;
    expect(co.items[0]).toMatchObject({ name: "Bruma Nocturna", overlap: 0.34, localAffinity: 0.88 });
  });
  it("Curitiba's promo zones card is empty (the brief's honest empty state)", () => {
    expect(cardsOf(samplePlaybookEvents("3464975")!).find((c) => c.kind === "promo_zones")!.status).toBe("empty");
  });
  it("cities without a sample playbook return null", () => {
    expect(samplePlaybookEvents("5368361")).toBeNull();
    expect(sampleThisWeek("5368361")).toBeNull();
  });
});

describe("long-name sample playbooks", () => {
  const nameOf = (ev: GatewayEvent[] | null) => (ev!.find((e) => e.type === "playbook") as Extract<GatewayEvent, { type: "playbook" }>).playbook.city.name;
  it("rename Curitiba only when long is requested", () => {
    expect(nameOf(samplePlaybookEvents("3464975"))).toBe("Curitiba");
    expect(nameOf(samplePlaybookEvents("3464975", { long: true }))).toBe("San Juan de los Lagos");
    expect(nameOf(samplePlaybookEvents("4005539", { long: true }))).toBe("Guadalajara");
  });
});
