import { describe, expect, it } from "vitest";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { computeMoves } from "@/lib/qloo/moves";
import { parseShowcase, showcaseCities } from "@/lib/qloo/showcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { nextTour, TOURS, tourById, tourStorageKey } from "./tours";

const show = () => parseShowcase(syntheticShowcase);
const sentences = (s: string): number => (s.match(/[.!?]+(?=\s+[A-Z"“]|$)/g) ?? []).length;

describe("tour registry", () => {
  it("lists the four tours in order with id, title, minutes and a step builder", () => {
    expect(TOURS.map((t) => t.id)).toEqual(["essentials", "plan", "team", "trust"]);
    expect(TOURS.map((t) => t.title)).toEqual(["The essentials", "Plan the tour", "Work as a team", "Trust and agents"]);
    for (const t of TOURS) {
      expect(Number.isInteger(t.minutes) && t.minutes >= 1).toBe(true);
      expect(typeof t.steps).toBe("function");
    }
  });
  it("has 9, 6, 6 and 4 steps", () => {
    expect(TOURS.map((t) => t.steps(show()).length)).toEqual([9, 6, 6, 4]);
  });
  it("the essentials lead with the sponsor story, not the board", () => {
    const ids = tourById("essentials")!.steps(show()).map((s) => s.id);
    expect(ids).toEqual(["hook", "age", "pitch", "claims", "playbook", "board", "without", "ask", "book"]);
  });
  it("every step has a unique id, title, route, at least one target and at most two short sentences", () => {
    for (const t of TOURS) {
      const steps = t.steps(show());
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
      for (const s of steps) {
        const where = `${t.id}/${s.id}`;
        expect(s.title.length > 0, where).toBe(true);
        expect(s.route.startsWith("/"), where).toBe(true);
        expect(s.targets.length > 0, where).toBe(true);
        expect(sentences(s.body), `${where}: ${s.body}`).toBeLessThanOrEqual(2);
        expect(s.body.length, where).toBeLessThanOrEqual(300);
      }
    }
  });
  it("copy rules: no 'insights', no '%', pronoun-neutral", () => {
    for (const t of TOURS) for (const s of t.steps(show())) {
      const text = `${s.title} ${s.body}`;
      expect(text, `${t.id}/${s.id}`).not.toMatch(/insights/i);
      expect(text, `${t.id}/${s.id}`).not.toContain("%");
      expect(text, `${t.id}/${s.id}`).not.toMatch(/\b(he|she|his|hers|him|himself|herself)\b/i);
    }
  });
  it("tour titles and minutes obey the copy rules too", () => {
    for (const t of TOURS) expect(t.title).not.toMatch(/insights|%/i);
  });
  it("builds every tour from the placeholder recording without throwing", () => {
    for (const t of TOURS) expect(t.steps(parseShowcase(PLACEHOLDER_SHOWCASE)).length).toBeGreaterThan(0);
  });
  it("names and numbers come from the recording, never hard-coded", () => {
    const s = show();
    const mover = computeMoves(showcaseCities(s)).find((m) => m.delta > 0)!.city;
    const pb = s.playbooks[mover.id]!.find((e) => e.type === "playbook")! as { playbook: { cards: Array<{ kind: string; items: Array<Record<string, unknown>> }> } };
    Object.assign(pb.playbook.cards.find((c) => c.kind === "sponsors")!.items[0]!, { name: "Fixture Brand", artistRank: 1, cityRank: null });
    const all = TOURS.flatMap((t) => t.steps(s));
    const hook = tourById("essentials")!.steps(s)[0]!;
    expect(hook.body).toContain(`In ${mover.name} the artist's fans rank Fixture Brand #1, and Fixture Brand isn't in`);
    expect(hook.body).toContain("top 20");
    expect(all.map((x) => x.body).join(" ")).not.toMatch(/Stüssy|King Krule/);
  });
  it("the age step explains over-index against the average audience, not a share", () => {
    const age = tourById("essentials")!.steps(show())[1]!;
    expect(age.body).toMatch(/over-index/);
    expect(age.body).toMatch(/average audience/);
    expect(age.body).toMatch(/not a share/);
    expect(age.targets[0]).toBe("sponsors-age");
  });
  it("the board step says plainly that an LLM is good at picking big markets", () => {
    const board = tourById("essentials")!.steps(show())[5]!;
    expect(board.body).toMatch(/LLM is good at picking big markets/);
    expect(board.body).toMatch(/context for winning each city/);
  });
  it("lazy controls are highlighted, never triggered: the plan tour points at the Advance tab and the compare control", () => {
    const plan = tourById("plan")!.steps(show());
    expect(plan.map((s) => s.id)).toEqual(["age-matrix", "filters", "advance", "budget", "chat", "compare"]);
    expect(plan[2]!.targets[0]).toBe("tab-advance");
    expect(plan[4]!.opens).toBe("ask");
    expect(plan[5]!.targets[0]).toBe("sponsors-compare");
    expect(plan[5]!.body).toMatch(/Qloo's own (fan )?ranking/);
  });
  it("the team and trust tours cover the listed surfaces", () => {
    expect(tourById("team")!.steps(show()).map((s) => s.id)).toEqual(["workspace", "status", "notes", "override", "share", "decisions"]);
    expect(tourById("trust")!.steps(show()).map((s) => s.route.split("?")[0])).toEqual(["/proof", "/proof", "/agents", "/v2"]);
    expect(tourById("team")!.requires).toBe("workspace");
  });
});

describe("tour storage keys and next-tour offer", () => {
  it("keeps tiq.tour.v1 for the essentials and tiq.tour.<id> for the rest", () => {
    expect(tourStorageKey("essentials")).toBe("tiq.tour.v1");
    expect(tourStorageKey("plan")).toBe("tiq.tour.plan");
    expect(tourStorageKey("team")).toBe("tiq.tour.team");
    expect(tourStorageKey("trust")).toBe("tiq.tour.trust");
  });
  it("offers the next tour in order and none after the last", () => {
    expect(nextTour("essentials")?.id).toBe("plan");
    expect(nextTour("plan")?.id).toBe("team");
    expect(nextTour("team")?.id).toBe("trust");
    expect(nextTour("trust")).toBeNull();
  });
});
