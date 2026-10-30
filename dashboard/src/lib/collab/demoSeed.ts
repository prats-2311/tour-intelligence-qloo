import { applyDoNotBook, mentionsDoNotBook, visibleClaimTotals } from "../qloo/doNotBook";
import { mentionsNonSponsor } from "../qloo/nonSponsors";
import { VERDICT_LABEL } from "../qloo/labels";
import { sortCities, summarize } from "../qloo/ranking";
import { showcaseCities, showcasePlaybookEvents, showcaseThisWeek, showcaseWithoutQloo } from "../qloo/showcase";
import type { CardKind, GatewayEvent, Narrative, PlaybookCard, ScoredCity, ThisWeek, WithoutQloo } from "../qloo/types";
import { zoneDisplayLabel } from "../qloo/zones";
import type { Seed } from "./api";
import { cardThread, cityThread, type Role } from "./types";

/** Fictional teammates. Generic first names only; the server tags everything they write "Demo teammate". */
const CAST = { Maya: "Manager", Leo: "Booking agent", Priya: "Brand team", Sam: "Promoter", Ana: "Promoter" } as const satisfies Record<string, Role>;
type Who = keyof typeof CAST;
type Line = [Who, string | null];

/** The slice of the recording the discussion may quote. Every number and name in a seeded note comes from here. */
export interface Recording {
  cities: ScoredCity[];
  cards: (cityId: string) => PlaybookCard[] | null;
  narrative: (cityId: string) => Narrative | undefined;
  week: (cityId: string) => ThisWeek | null;
  without: WithoutQloo;
}

export function recordingFromShowcase(): Recording {
  const events = (id: string): GatewayEvent[] => showcasePlaybookEvents(id) ?? [];
  return {
    cities: showcaseCities(),
    cards: (id) => (showcasePlaybookEvents(id) ? events(id).flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) : null),
    narrative: (id) => events(id).flatMap((e) => (e.type === "narrative" ? [e.narrative] : []))[0],
    week: (id) => showcaseThisWeek(id),
    without: showcaseWithoutQloo(),
  };
}

type Slot = string | number | null | undefined;
/** Template tag: a note whose facts are not all known is dropped (null), never filled with a guess. */
const say = (s: TemplateStringsArray, ...v: Slot[]): string | null => (v.some((x) => x === null || x === undefined || x === "") ? null : s.reduce((a, part, i) => a + part + (i < v.length ? String(v[i]) : ""), ""));

const round = (v: number | null | undefined): string | null => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : null);
const fit2 = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null);
const pc = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(v * 100)) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const region = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
const countryName = (code: string): string => (code === "US" ? "The United States" : code === "GB" ? "The United Kingdom" : region?.of(code) ?? code);

/** Minutes between notes in a thread, so a discussion reads as spread over time rather than all at once. */
const GAPS = [0, 14, 33, 47, 71, 96, 128, 160, 190];

export function buildDemoSeed(rec: Recording): Seed | null {
  const withBook = rec.cities.filter((c) => rec.cards(c.id));
  if (withBook.length === 0) return null;
  const byWin = [...withBook].sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1));
  const lead = withBook.find((c) => /^los angeles$/i.test(c.name)) ?? byWin[0]!;
  const others = withBook.filter((c) => c !== lead);
  const hold = [...others].sort((a, b) => (a.activation.value ?? 1e9) - (b.activation.value ?? 1e9))[0];
  const rest = others.filter((c) => c !== hold).sort((a, b) => (b.winnability.value ?? -1) - (a.winnability.value ?? -1));
  const cityA = rest.find((c) => c.country === "MX") ?? rest[0];
  const cityB = rest.find((c) => c !== cityA);
  const winRank = (c: ScoredCity) => sortCities(rec.cities, "winnability").findIndex((x) => x.id === c.id) + 1;
  const denRank = (c: ScoredCity) => sortCities(rec.cities, "density").findIndex((x) => x.id === c.id) + 1;
  const items = (c: ScoredCity, kind: CardKind): PlaybookCard["items"] => {
    const card = rec.cards(c.id)?.find((x) => x.kind === kind && x.status === "ok");
    return card ? applyDoNotBook(card).card.items : [];
  };
  const zones = (c: ScoredCity) => items(c, "promo_zones").filter((z) => num(z.share) !== null).sort((a, b) => num(b.share)! - num(a.share)!).map((z) => ({ label: zoneDisplayLabel(str(z.label) ?? "", c.name), share: pc(z.share) }));

  const out: Required<Seed> = { statuses: [], threads: [], overrides: [], leads: [] };
  /** Adds a thread from lines that kept every fact; returns the minutes-ago of each kept note (empty when dropped). */
  const thread = (key: string, startAgo: number, lines: Line[], resolvedBy?: Who): number[] => {
    // Never quote a listed act or a hidden non-sponsor, whichever recorded field the name came from.
    const kept = lines.filter((l): l is [Who, string] => l[1] !== null && !mentionsDoNotBook(l[1]) && !mentionsNonSponsor(l[1]));
    if (kept.length === 0) return [];
    const times = kept.map((_, i) => startAgo - GAPS[i]!);
    out.threads.push({
      key,
      messages: kept.map(([w, text], i) => ({ name: w, role: CAST[w], text, agoMin: times[i]! })),
      ...(resolvedBy ? { resolved: { name: resolvedBy, role: CAST[resolvedBy], agoMin: times[times.length - 1]! - 1 } } : {}),
    });
    return times;
  };
  const status = (c: ScoredCity | undefined, s: string, ago: number | undefined) => { if (c && ago !== undefined) out.statuses.push({ cityId: c.id, status: s, name: "Maya", role: CAST.Maya, agoMin: ago - 1 }); };
  const last = (t: number[]) => (t.length ? t[t.length - 1] : undefined);

  // TOUR: routing brainstorm
  {
    const v = summarize(rec.cities);
    const mix = (["play", "hidden_goldmine", "de_risk", "consider", "skip"] as const).filter((k) => v[k] > 0).map((k) => `${v[k]} ${VERDICT_LABEL[k]}`);
    const byCountry = new Map<string, ScoredCity[]>();
    for (const c of rec.cities) byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c]);
    const stat = ([code, cs]: [string, ScoredCity[]]) => ({ name: countryName(code), play: cs.filter((c) => c.verdict === "play" || c.verdict === "hidden_goldmine").length, total: cs.length, cs });
    const countries = [...byCountry.entries()].map(stat).sort((a, b) => b.play - a.play || b.total - a.total);
    const [c1, c2] = countries;
    const none = countries.find((c) => c.play === 0 && c.cs.some((x) => x.fanHeat.value !== null));
    const noneTop = none ? [...none.cs].sort((a, b) => (b.fanHeat.value ?? -1) - (a.fanHeat.value ?? -1))[0] : undefined;
    const g = rec.without.status === "ok" ? rec.without.ranked[1] : undefined;
    const gc = g ? rec.cities.find((c) => c.name === g.name && c.country === g.country) : undefined;
    thread("tour:board", 4200, [
      ["Maya", rec.cities.length && mix.length ? say`Quick read of the board: ${rec.cities.length} markets scored, ${mix.join(", ")}. Where should we lead?` : null],
      ["Leo", c1 && c2 ? say`${c1.name} has ${c1.play} Play out of ${c1.total} scored. ${c2.name} has ${c2.play} out of ${c2.total}.` : null],
      ["Ana", none && noneTop ? say`${none.name} has no Play market yet, but ${noneTop.name}'s fan heat is ${round(noneTop.fanHeat.value)}.` : null],
      ["Priya", gc ? say`Without Qloo puts ${g!.name} second, but the board scores it ${VERDICT_LABEL[gc.verdict]} at ${round(gc.winnability.value)}. It also can't name a brand or an act, so there's nothing to pitch from.` : null],
      ["Maya", c1 && cityA ? say`So the plan: lead with ${c1.name.replace(/^The /, "the ")}, add ${cityA.name}, and hold the rest loosely.` : null],
    ]);
  }

  // LOS ANGELES (the lead city)
  {
    const t = thread(cityThread(lead.id), 3900, [
      ["Maya", say`Should ${lead.name} be our first confirmed stop? It's #${winRank(lead)} on winnability at ${round(lead.winnability.value)}, up from #${denRank(lead)} on fan heat alone.`],
      ["Leo", say`Fan heat is ${round(lead.fanHeat.value)}, which is hard to argue with. Is the rest solid?`],
      ["Priya", say`Activation is the weaker half at ${round(lead.activation.value)}. @Promoter can you help on the local side?`],
      ["Sam", say`Happy to. More local work is a reason to start early, not to skip ${lead.name}.`],
      ["Leo", say`Then I'd treat ${lead.name} as the anchor and keep the other cities flexible until it's locked.`],
      ["Maya", say`Agreed. @Booking agent please start on ${lead.name} first.`],
      ["Maya", say`Decision: ${lead.name} is confirmed as the first stop.`],
    ]);
    status(lead, "confirmed", last(t));
  }
  {
    const b = items(lead, "sponsors");
    const [b1, b2, b3] = b.map((x) => str(x.name));
    const r = (i: number) => num(b[i]?.artistRank);
    const cityRank = num(b[0]?.cityRank);
    const claims = rec.narrative(lead.id);
    const tot = claims?.status === "ok" ? visibleClaimTotals(claims.cards) : null;
    const claimLine = !tot ? null : tot.removed === 0 ? `all ${tot.verified} claims verified, none removed` : `${tot.verified} verified, ${tot.removed} removed`;
    const t = thread(cardThread(lead.id, "sponsors"), 3300, [
      ["Priya", b1 && r(0) !== null ? say`Fans rank ${b1} #${r(0)} and ${cityRank === null ? "it isn't in the city's top 20" : `the city ranks it #${cityRank}`}. That makes it our strongest brand story.` : null],
      ["Leo", b2 && b3 ? say`Any brand-safety worries with ${b2} or ${b3}? I'd like a quick check before we pitch anyone.` : null],
      ["Priya", !b1 ? null : say`I opened Checked claims: ${claimLine}. The brand names on the card all come from Qloo.`],
      ["Sam", b1 && b2 && r(1) !== null ? say`${b2} is #${r(1)} with fans too. Could we pitch ${b1} and ${b2} together?` : null],
      ["Leo", b1 && b2 ? say`Not sure. Two pitches at once could split the attention. One at a time?` : null],
      ["Priya", b1 && b2 && b3 ? say`Fair. Pitch order, as a plan: ${b1} first, then ${b2}, then ${b3}.` : null],
      ["Priya", b1 ? say`I added ${b1} to Sponsor leads as a pitch idea. Nothing is agreed with anyone yet.` : null],
      ["Maya", b1 ? say`Good. Let's keep it a pitch idea until the team signs off.` : null],
    ]);
    if (b1 && t.length >= 2) out.leads.push({ cityId: lead.id, text: `${b1} (pitch idea, no contact yet)`, name: "Priya", role: CAST.Priya, agoMin: t[Math.max(0, t.length - 2)]! - 1 });
  }
  {
    const v = items(lead, "venue_fit");
    const [v1, v2] = v.map((x) => str(x.name));
    const t = thread(cardThread(lead.id, "venue_fit"), 2800, [
      ["Leo", v1 && v2 ? say`Top room is ${v1} at fit ${fit2(v[0]?.affinity)}, then ${v2} at ${fit2(v[1]?.affinity)}.` : null],
      ["Sam", v1 && v2 ? say`They're nearly tied. I'd use ${v2} for a presale night and keep ${v1} for the main date.` : null],
      ["Maya", v2 ? say`I'm setting Best room to ${v2} for now, since the presale comes first. Qloo's pick stays visible under it.` : null],
      ["Leo", v2 ? say`Works for me. We should check both rooms before we commit to either.` : null],
    ]);
    if (v1 && v2 && t.length >= 3) out.overrides.push({ cityId: lead.id, field: "best_room", value: v2, original: v1, name: "Maya", role: CAST.Maya, agoMin: t[2]! - 1 });
  }
  {
    const a = items(lead, "co_billing");
    const [a1, a2] = a.map((x) => str(x.name));
    thread(cardThread(lead.id, "co_billing"), 2500, [
      ["Leo", a1 ? say`Top support pick is ${a1}: fans share taste ${pc(a[0]?.sharedTaste)}% and the city likes them ${pc(a[0]?.localAffinity)}%.` : null],
      ["Sam", a2 ? say`${a2} is right behind at ${pc(a[1]?.sharedTaste)}%. Which one fits our local crowd better?` : null],
      ["Priya", a1 && a2 ? say`Both read well. I'd lead with ${a1} and keep ${a2} as the back-up.` : null],
      ["Maya", a1 && a2 ? say`Decision: support shortlist is ${a1} first, ${a2} second.` : null],
    ], "Maya");
    const tl = items(lead, "talent");
    const [n1, n2, n3] = tl.map((x) => str(x.name));
    const suggested = tl.some((x) => x.source === "suggested");
    thread(cardThread(lead.id, "talent"), 2300, [
      ["Sam", n1 && n2 && n3 ? say`The Acts fans love card lists ${n1}, ${n2} and ${n3}. Anyone know these acts?` : null],
      ["Leo", suggested ? say`The card says they're suggested or popular in the city, not confirmed locals. So we won't bill anyone as a local guest without checking.` : null],
      ["Sam", suggested ? say`Agreed. I'll check who is actually based here.` : null],
    ]);
  }
  const zonesThread = (c: ScoredCity, start: number, a: Who, b: Who) => {
    const [z1, z2, z3] = zones(c);
    thread(cardThread(c.id, "promo_zones"), start, [
      [a, z1 && z2 ? say`For posters and the street team, ${z1.label} carries ${z1.share}% of the fan share, then ${z2.label} at ${z2.share}%.` : null],
      [b, z3 ? say`${z3.label} is third at ${z3.share}%. Worth a few posters?` : null],
      ["Leo", z1 && z2 ? say`Start with ${z1.label}, then ${z2.label}. Only go further if there's budget.` : null],
      ["Maya", z1 ? say`Decision: the street team goes to ${z1.label} first.` : null],
    ], "Maya");
  };
  zonesThread(lead, 2100, "Sam", "Priya");
  {
    const picks = items(lead, "local_moment").filter((x) => x.category === "movie" || x.category === "tv_show").map((x) => str(x.name));
    const [m1, m2] = picks;
    thread(cardThread(lead.id, "local_moment"), 1900, [
      ["Priya", m1 && m2 ? say`Fans here pick ${m1} and ${m2}. A screening or a listening night could tie in.` : null],
      ["Sam", m1 && m2 ? say`Nice idea, but let's check it works with the room before planning anything.` : null],
      ["Leo", m1 ? say`${m1} fits a pre-show playlist too. Easy to try.` : null],
    ]);
    const n = rec.narrative(lead.id);
    const title = n?.status === "ok" ? str(n.merch?.title) : null;
    thread(cardThread(lead.id, "merch"), 1700, [
      ["Priya", title ? say`The merch card says ${title}. It's labelled a model suggestion, not Qloo data.` : null],
      ["Leo", title ? say`So we treat it as a creative brief, not evidence. @Brand team can you shape it into a short brief?` : null],
      ["Maya", title ? say`Decision: the merch card is a creative brief only.` : null],
    ], "Maya");
  }

  // OTHER CITIES
  if (cityA) {
    const v1 = str(items(cityA, "venue_fit")[0]?.name);
    const t = thread(cityThread(cityA.id), 1500, [
      ["Ana", say`${cityA.name} scores ${round(cityA.winnability.value)} on winnability, with fan heat at ${round(cityA.fanHeat.value)}.`],
      ["Leo", hold ? say`Activation is ${round(cityA.activation.value)}, against ${round(hold.activation.value)} in ${hold.name}. Do we trust it?` : null],
      ["Ana", v1 ? say`Qloo marks it ${VERDICT_LABEL[cityA.verdict]}. The top room is ${v1}.` : null],
      ["Maya", say`I'm confirming ${cityA.name} as the second stop.`],
    ]);
    status(cityA, "confirmed", last(t));
    zonesThread(cityA, 1300, "Ana", "Sam");
  }
  const weekCity = [lead, cityA, cityB, hold].find((c): c is ScoredCity => !!c && (() => { const w = rec.week(c.id); return w?.status === "ok" && w.items.length > 0; })());
  if (weekCity) {
    const w = rec.week(weekCity.id);
    const first = w?.status === "ok" ? str(w.items[0]?.text) : null;
    thread(cardThread(weekCity.id, "this_week"), 1200, [
      ["Ana", first ? say`This week in ${weekCity.name} lists "${first?.replace(/[.\s]+$/, "")}". Worth checking against our dates.` : null],
      ["Leo", first ? say`Good catch. A competing show the same night would matter.` : null],
    ]);
  }
  if (hold) {
    const t = thread(cityThread(hold.id), 1100, [
      ["Leo", say`${hold.name}'s activation is ${round(hold.activation.value)}, the lowest of the cities with a playbook. Fan heat is ${round(hold.fanHeat.value)}.`],
      ["Ana", say`So the fans are there but the local side is thin. Can we wait?`],
      ["Sam", say`I'd wait too. We can look again after ${lead.name} is locked.`],
      ["Maya", say`Putting ${hold.name} on hold for now, because of the activation number.`],
    ]);
    status(hold, "on_hold", last(t));
  }
  if (cityB) {
    const s1 = str(items(cityB, "sponsors")[0]?.name);
    const v1 = str(items(cityB, "venue_fit")[0]?.name);
    thread(cityThread(cityB.id), 800, [
      ["Sam", v1 ? say`${cityB.name} has fan heat ${round(cityB.fanHeat.value)} and winnability ${round(cityB.winnability.value)}. Top room is ${v1}.` : null],
      ["Priya", s1 ? say`Top brand there is ${s1}. Worth a look, but not before ${lead.name} is locked.` : null],
      ["Leo", say`Let's leave it as Considering for now.`],
    ]);
  }

  // TOUR: Tour Book prep
  thread("tour:book", 400, [
    ["Maya", cityA ? say`Tour Book prep: please sign off ${lead.name} and ${cityA.name} by Friday.` : say`Tour Book prep: please sign off ${lead.name} by Friday.`],
    ["Leo", say`I'll take venue and support in each chapter. @Brand team sponsors are yours.`],
    ["Priya", say`On it. @Promoter please read your own city chapters too.`],
    ["Sam", say`I'll read the ${lead.name} chapter.`],
  ]);

  return out.threads.length ? out : null;
}

export const demoSeedFromRecording = (): Seed | null => buildDemoSeed(recordingFromShowcase());
