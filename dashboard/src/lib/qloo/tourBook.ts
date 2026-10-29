import type { CardKind, GatewayEvent, PlaybookCard, ScoredCity, Source, ThisWeek, TourBrief } from "./types";
import { accentFor } from "./cityAccent";
import type { PlaybookState } from "./playbookReducer";
import { toolPlainName } from "./labels";
import { firstOkName } from "./playbookFacts";
import { zoneDisplayLabel } from "./zones";
import { sortCities } from "./ranking";
import { summariseCalls, type CallSummary } from "./callSummary";

export interface BookCityChapter {
  city: ScoredCity; accent: string; status: "ready" | "incomplete"; incompleteReason?: string;
  playbook?: PlaybookState; week?: ThisWeek;
  advance: Array<{ label: string; value: string }>;
  claims: { verified: number; removed: number } | null;
}
export interface ProvenanceRow { n: number; tool: string; /** Plain-language tool name. */ name: string; resultCount: number; inputs: string; status: string; cached: boolean; cacheKey: string; hash: string }
export interface TourBook {
  title: string; subtitle: string; source: Source;
  market: { rows: ScoredCity[]; shortlisted: Set<string>; slope: Array<{ id: string; name: string; densityRank: number; winRank: number; highlight: boolean }>; /** Cities Qloo could not place: left out of the slope chart and footnoted. */ unplaced: string[] };
  chapters: BookCityChapter[];
  provenance: ProvenanceRow[];
  /** Request counts from the same logs the board chip reads. */
  calls: CallSummary;
}

const SEASONS = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"];

export function seasonLabel(w?: { start: string; end: string }): string {
  if (!w) return "";
  const [y, m] = w.start.split("-").map(Number);
  if (!y || !m) return "";
  return `${SEASONS[m - 1]} ${m === 12 ? y + 1 : y}`;
}

function incompleteReason(p?: PlaybookState): string | undefined {
  if (!p) return "Not loaded";
  if (p.status === "done") return undefined;
  if (p.status === "error") {
    if (p.error?.code === "BUDGET") return "Session limit reached";
    if (p.error?.code === "NO_SAMPLE") return "No sample playbook";
    return p.error?.message ?? "Not loaded";
  }
  if (p.status === "interrupted") return "Connection lost";
  return "Not loaded";
}

const firstName = (cards: PlaybookCard[], kind: CardKind, key: string): string => firstOkName(cards, kind, key) ?? "—";

function thisWeekValue(week?: ThisWeek): string {
  if (!week) return "—";
  if (week.status === "unavailable") return "Live web context unavailable";
  return week.items[0]?.text ?? "—";
}

function advanceRows(p: PlaybookState | undefined, week: ThisWeek | undefined, cityName?: string): Array<{ label: string; value: string }> {
  const cards = p?.cards ?? [];
  const sponsors = (cards.find((c) => c.kind === "sponsors")?.items ?? []).slice(0, 3).map((i) => i.name).filter((n): n is string => typeof n === "string");
  const merch = p?.narrative?.status === "ok" ? p.narrative.merch?.title : undefined;
  const thisWeek = thisWeekValue(week);
  return [
    { label: "Top zone", value: zoneDisplayLabel(firstName(cards, "promo_zones", "label"), cityName) },
    { label: "Best room", value: firstName(cards, "venue_fit", "name") },
    { label: "Support", value: firstName(cards, "co_billing", "name") },
    { label: "Sponsors top 3", value: sponsors.length ? sponsors.join(", ") : "—" },
    { label: "Merch drop", value: merch || "—" },
    // An empty week has nothing to say: no "This week —" tile, same as the omitted section.
    ...(thisWeek === "—" ? [] : [{ label: "This week", value: thisWeek }]),
  ];
}

function claimTotals(p?: PlaybookState): { verified: number; removed: number } | null {
  if (!p || p.status !== "done" || p.narrative?.status !== "ok") return null;
  let verified = 0, removed = 0;
  for (const c of Object.values(p.narrative.cards)) { verified += c?.verified.length ?? 0; removed += c?.removed.length ?? 0; }
  return { verified, removed };
}

const INPUT_KEYS = ["entity", "signals", "within", "filter_location", "signal_location", "target_type"];
function summariseArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of INPUT_KEYS) {
    const v = args[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{24,}$/i.test(v)) continue; // raw entity ids mean nothing to a promoter
    if (Array.isArray(v) && v.every((x) => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{24,}$/i.test(x))) continue;
    parts.push(typeof v === "string" ? v : JSON.stringify(v));
  }
  const s = parts.join(" · ");
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

function buildProvenance(logs: GatewayEvent[][]): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [];
  const seen = new Set<string>();
  for (const log of logs) {
    const pending: Array<{ tool: string; args: Record<string, unknown>; cached: boolean }> = [];
    for (const e of log) {
      if (e.type === "tool_call") { pending.push({ tool: e.tool, args: e.args, cached: e.cached }); continue; }
      if (e.type !== "tool_result") continue;
      const at = pending.findIndex((c) => c.tool === e.tool);
      const call = at >= 0 ? pending.splice(at, 1)[0]! : undefined;
      if (seen.has(e.cacheKey)) continue;
      seen.add(e.cacheKey);
      rows.push({
        n: rows.length + 1, tool: e.tool, name: toolPlainName(e.tool, call?.args ?? {}), resultCount: e.resultCount, inputs: call ? summariseArgs(call.args) : "", status: e.status,
        cached: call?.cached ?? false, cacheKey: e.cacheKey, hash: `${e.cacheKey.slice(0, 4)}…${e.cacheKey.slice(-2)}`,
      });
    }
  }
  return rows;
}

export function buildTourBook(input: {
  brief: TourBrief; artistName: string; source: Source; cities: ScoredCity[]; shortlist: string[]; accentOrder: string[];
  boardLog: GatewayEvent[]; playbooks: Record<string, PlaybookState | undefined>; weeks: Record<string, ThisWeek | undefined>;
}): TourBook {
  const byWin = sortCities(input.cities, "winnability");
  const byDensity = sortCities(input.cities, "density");
  const rank = (list: ScoredCity[], id: string) => list.findIndex((c) => c.id === id) + 1;
  // Both columns rank the same set (cities with both scores), so every rank is 1..n and no line leaves the chart.
  const plotted = (c: ScoredCity) => c.winnability.value !== null && c.fanHeat.value !== null;
  const winOrder = byWin.filter(plotted), densityOrder = byDensity.filter(plotted);
  const slope = winOrder.map((c) => {
    const densityRank = rank(densityOrder, c.id), winRank = rank(winOrder, c.id);
    return { id: c.id, name: c.name, densityRank, winRank, highlight: c.verdict === "hidden_goldmine" && winRank < densityRank };
  });
  const chosen = new Set(input.shortlist);
  const chapters: BookCityChapter[] = byWin.filter((c) => chosen.has(c.id)).map((city) => {
    const playbook = input.playbooks[city.id], week = input.weeks[city.id];
    const reason = incompleteReason(playbook);
    return {
      city, accent: accentFor(city.id, input.accentOrder), status: reason ? "incomplete" : "ready",
      ...(reason ? { incompleteReason: reason } : {}),
      ...(playbook ? { playbook } : {}), ...(week ? { week } : {}),
      advance: advanceRows(playbook, week, city.name), claims: claimTotals(playbook),
    };
  });
  const logs = [input.boardLog, ...chapters.map((c) => c.playbook?.log ?? [])];
  return {
    title: input.brief.regions.length ? `${input.artistName}: ${input.brief.regions.join(", ")}` : input.artistName,
    subtitle: seasonLabel(input.brief.dateWindow), source: input.source,
    market: { rows: byWin, shortlisted: new Set(input.shortlist), slope, unplaced: byWin.filter((c) => c.insufficientReason === "location_unresolved").map((c) => c.name) },
    chapters, provenance: buildProvenance(logs),
    calls: summariseCalls(input.boardLog, chapters.filter((c) => c.playbook).map((c) => ({ id: c.city.id, name: c.city.name, log: c.playbook!.log }))),
  };
}

const CAMPAIGN_TITLE_MAX = 200;

export function campaignTitle(artist: string, regions: string[]): string {
  const t = regions.length ? `${artist} — ${regions.join(", ")}` : artist;
  return t.length <= CAMPAIGN_TITLE_MAX ? t : `${t.slice(0, CAMPAIGN_TITLE_MAX - 1)}…`;
}
