// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LUMEN_VALE_SAMPLE } from "../qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS, samplePlaybookEvents, sampleThisWeek } from "../qloo/fixtures/lumenValePlaybooks";
import { pct } from "@/components/playbook/format";
import type { GatewayEvent, PlaybookCard, ScoredCity } from "../qloo/types";
import { buildDemoSeed, type Recording } from "./demoSeed";
import { WS_ID } from "./types";

const cities = LUMEN_VALE_SAMPLE.flatMap((e) => (e.type === "city_scored" ? [e.city] : []));
const cardsOf = (ev: GatewayEvent[] | null): PlaybookCard[] | null => (ev ? ev.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) : null);
const rec = (over: Partial<Recording> = {}): Recording => ({
  cities,
  cards: (id) => cardsOf((SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(id) ? samplePlaybookEvents(id) : null),
  narrative: (id) => (samplePlaybookEvents(id) ?? []).flatMap((e) => (e.type === "narrative" ? [e.narrative] : []))[0],
  week: (id) => sampleThisWeek(id),
  without: { status: "ok", ranked: cities.map((c) => ({ name: c.name, country: c.country })), model: "m", cached: true },
  ...over,
});

const messages = (s: ReturnType<typeof buildDemoSeed>) => (s?.threads ?? []).flatMap((t) => t.messages.map((m) => ({ key: t.key, ...m })));

/** Every number the UI could show for this recording, as the UI formats it. */
function allowedNumbers(r: Recording): Set<string> {
  const ok = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" || typeof v === "number") ok.add(String(v)); };
  r.cities.forEach((c: ScoredCity, i) => {
    [c.fanHeat.value, c.activation.value, c.winnability.value].forEach((v) => v !== null && add(Math.round(v)));
    add(i + 1);
    const cards = r.cards(c.id) ?? [];
    for (const card of cards) for (const it of card.items) {
      for (const k of ["affinity"]) if (typeof it[k] === "number") add((it[k] as number).toFixed(2));
      for (const k of ["share", "sharedTaste", "localAffinity"]) if (typeof it[k] === "number") { add(pct(it[k] as number).replace("%", "")); add(Math.round((it[k] as number) * 100)); }
      for (const k of ["artistRank", "cityRank"]) add(it[k]);
    }
  });
  for (let n = 0; n <= r.cities.length; n += 1) add(n); // counts of markets, verdicts and claims
  for (let n = 0; n <= 60; n += 1) add(n); // claim totals
  return ok;
}

describe("demo seed", () => {
  it("is null when no city has a recorded playbook", () => {
    expect(buildDemoSeed(rec({ cards: () => null }))).toBeNull();
    expect(buildDemoSeed(rec({ cities: [] }))).toBeNull();
  });
  it("covers the tour, several cities and the card types in tens of notes", () => {
    const s = buildDemoSeed(rec())!;
    const keys = s.threads!.map((t) => t.key);
    expect(keys).toContain("tour:board");
    expect(keys).toContain("tour:book");
    expect(keys.filter((k) => k.startsWith("city:")).length).toBeGreaterThanOrEqual(3);
    for (const kind of ["sponsors", "venue_fit", "co_billing", "promo_zones"]) expect(keys.some((k) => k.endsWith(`:${kind}`)), kind).toBe(true);
    expect(messages(s).length).toBeGreaterThanOrEqual(25);
    expect(s.threads!.filter((t) => t.resolved).length).toBeGreaterThanOrEqual(2);
    expect(s.statuses!.map((x) => x.status).sort()).toEqual(expect.arrayContaining(["confirmed", "on_hold"]));
    expect(s.overrides).toHaveLength(1);
    expect(s.leads).toHaveLength(1);
  });
  it("only the five fictional teammates write, with their roles, and every timestamp is within three days", () => {
    const s = buildDemoSeed(rec())!;
    const roles: Record<string, string> = { Maya: "Manager", Leo: "Booking agent", Priya: "Brand team", Sam: "Promoter", Ana: "Promoter" };
    const all = [...messages(s), ...s.statuses!, ...s.overrides!, ...s.leads!, ...s.threads!.flatMap((t) => (t.resolved ? [t.resolved] : []))];
    for (const x of all) { expect(roles[x.name], x.name).toBe(x.role); expect(x.agoMin).toBeGreaterThan(0); expect(x.agoMin).toBeLessThanOrEqual(3 * 24 * 60); }
  });
  it("every number in every note comes from the recording", () => {
    const r = rec();
    const ok = allowedNumbers(r);
    const bad = messages(buildDemoSeed(r)).flatMap((m) => (m.text.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !ok.has(n)).map((n) => `${m.key}: ${n} in "${m.text}"`));
    expect(bad).toEqual([]);
  });
  it("every named thing comes from the recording", () => {
    const r = rec();
    const names = new Set<string>(["Maya", "Leo", "Priya", "Sam", "Ana"]);
    const text = JSON.stringify([r.cities, ...r.cities.map((c) => r.cards(c.id)), ...r.cities.map((c) => r.narrative(c.id))]);
    const s = buildDemoSeed(r)!;
    const city = (key: string) => key.split(":")[1];
    for (const t of s.threads!) {
      if (t.key.startsWith("city:")) expect(r.cities.some((c) => c.id === city(t.key)), t.key).toBe(true);
      if (t.key.startsWith("card:")) expect(r.cards(city(t.key)!), t.key).not.toBeNull();
    }
    // Quoted proper names: capitalised words that are not sentence starts must appear in the recording.
    const countryWords = r.cities.flatMap((c) => (new Intl.DisplayNames(["en"], { type: "region" }).of(c.country) ?? "").split(" "));
    const fine = new Set([...countryWords, "United", "States", "Kingdom", "Qloo", "Play", "Consider", "Skip", "Friday", "Tour", "Book", "Without", "Checked", "Sponsor", "Best", "Local", "Decision", "Quick", "Fan", "Hidden", "De-risk", "Hidden goldmine", "Fair", "Pitch", "Fans", "Activation", "Considering", "Top", "Worth"]);
    for (const m of messages(s)) for (const w of (m.text.match(/(?<=[a-z,] )[A-Z][\w]+/g) ?? [])) if (!names.has(w) && !fine.has(w) && !text.includes(w)) throw new Error(`${m.key}: "${w}" in "${m.text}" is not in the recording`);
  });
  it("invents nothing about real businesses: no holds, fees, contacts or deals", () => {
    const words = /\b(contract|fee|fees|price|deposit|booked|signed|invoice|email|phone|call(?:ed)? (?:them|the)|spoke|talked to|on hold until|holds? .* until|\$|€|£|@\w+\.\w+)/i;
    for (const m of messages(buildDemoSeed(rec()))) expect(m.text, m.text).not.toMatch(words);
  });
  it("drops a note when its fact is missing instead of guessing", () => {
    const noSponsors = rec({ cards: (id) => (rec().cards(id) ?? null)?.filter((c) => c.kind !== "sponsors") ?? null });
    const keys = buildDemoSeed(noSponsors)!.threads!.map((t) => t.key);
    expect(keys.some((k) => k.endsWith(":sponsors"))).toBe(false);
    expect(buildDemoSeed(noSponsors)!.leads).toHaveLength(0);
    const noWithout = buildDemoSeed(rec({ without: { status: "unavailable", reason: "error", message: "x" } }))!;
    expect(messages(noWithout).some((m) => /Without Qloo/.test(m.text))).toBe(false);
    expect(messages(noWithout).some((m) => m.key === "tour:board")).toBe(true);
  });
  it("never quotes a do-not-book act or a hidden non-sponsor, even when the raw recording lists them first", () => {
    const bad = (name: string) => ({ name, entityId: "x", affinity: 0.9, sharedTaste: 0.5, localAffinity: 0.5, category: "artist", source: "suggested" });
    const base = rec();
    const tampered = rec({
      cards: (id) => base.cards(id)?.map((c) => (c.kind === "co_billing" || c.kind === "talent" ? { ...c, items: [bad("Ariel Pink"), ...c.items] } : c.kind === "sponsors" ? { ...c, items: [bad("Planned Parenthood"), ...c.items] } : c)) ?? null,
      week: (id) => { const w = base.week(id); return w?.status === "ok" && w.items[0] ? { ...w, items: [{ ...w.items[0], text: "Ariel Pink plays a rival show that night." }, ...w.items.slice(1)] } : w; },
    });
    const all = messages(buildDemoSeed(tampered));
    expect(all.length).toBeGreaterThan(20);
    for (const m of all) { expect(m.text, m.text).not.toMatch(/ariel pink/i); expect(m.text, m.text).not.toMatch(/planned parenthood/i); }
    expect(buildDemoSeed(tampered)!.leads!.some((l) => /planned parenthood/i.test(JSON.stringify(l)))).toBe(false);
  });
  it("seeded card threads use real card kinds and the card title Acts fans love, never Local acts", () => {
    const s = buildDemoSeed(rec())!;
    const kinds = new Set(["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing", "talent", "this_week"]);
    for (const t of s.threads!) if (t.key.startsWith("card:")) expect(kinds.has(t.key.split(":")[2]!), t.key).toBe(true);
    for (const m of messages(s)) expect(m.text).not.toMatch(/Local acts/);
  });
  it("fits the API: valid thread keys, short notes, small body", () => {
    const s = buildDemoSeed(rec())!;
    for (const t of s.threads!) expect(t.key).toMatch(/^(tour:[a-z_]{1,24}|city:[A-Za-z0-9_-]{1,32}|card:[A-Za-z0-9_-]{1,32}:[a-z_]{1,24})$/);
    for (const m of messages(s)) { expect(m.text.length).toBeLessThanOrEqual(1000); expect(m.name.length).toBeLessThanOrEqual(40); }
    for (const c of [...s.statuses!, ...s.overrides!, ...s.leads!]) expect(c.cityId).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(JSON.stringify(s).length).toBeLessThan(30_000);
    expect(WS_ID.test("abcdefghij")).toBe(true);
  });
});
