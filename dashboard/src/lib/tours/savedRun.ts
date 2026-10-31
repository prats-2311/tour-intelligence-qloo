import { getPlaybook, playbookKey, seedPlaybook } from "@/lib/qloo/playbookStore";
import { playbookReducer, initialPlaybook, type PlaybookState } from "@/lib/qloo/playbookReducer";
import { cleanEvents } from "@/lib/qloo/showcase";
import type { BoardState } from "@/lib/qloo/tourBoardReducer";
import type { GatewayEvent, ScoredCity, TourBrief } from "@/lib/qloo/types";
import type { TourSummary } from "./api";

/**
 * The saved-run format. It has the same shape as a recorded showcase (`boardEvents` + `playbooks` by city id, see lib/qloo/showcase.ts), so the
 * same events a live stream produced replay through the same reducers: opening a saved tour makes no Qloo call for the board, and every playbook
 * the session had already loaded comes back with it (a city without one is fetched live when opened, as usual). `thisWeek`, the generic ranking
 * and strategist chats are not stored: they are cheap to ask again and can be stale. `shortlist` keeps the cities held for the tour.
 */
export interface SavedRun { v: 1; brief: TourBrief; boardEvents: GatewayEvent[]; playbooks: Record<string, GatewayEvent[]>; shortlist: string[] | null }

export function buildSavedRun(state: BoardState, playbooks: Record<string, GatewayEvent[]>): SavedRun {
  return { v: 1, brief: state.brief!, boardEvents: state.log, playbooks, shortlist: state.shortlist };
}

/** Reads a stored run defensively: anything unrecognised is dropped, and a run with no scored city is not a run (null). */
export function parseSavedRun(input: unknown): SavedRun | null {
  const o = input as { v?: unknown; brief?: unknown; boardEvents?: unknown; playbooks?: unknown; shortlist?: unknown } | null;
  if (!o || typeof o !== "object" || o.v !== 1 || !o.brief || typeof o.brief !== "object" || typeof (o.brief as TourBrief).artist !== "string") return null;
  const boardEvents = cleanEvents(o.boardEvents);
  if (!boardEvents.some((e) => e.type === "city_scored")) return null;
  const playbooks: Record<string, GatewayEvent[]> = {};
  if (o.playbooks && typeof o.playbooks === "object") for (const [id, evs] of Object.entries(o.playbooks as Record<string, unknown>)) { const c = cleanEvents(evs); if (c.length) playbooks[id] = c; }
  const shortlist = Array.isArray(o.shortlist) && o.shortlist.every((x) => typeof x === "string") ? (o.shortlist as string[]) : null;
  return { v: 1, brief: o.brief as TourBrief, boardEvents, playbooks, shortlist };
}

export function summaryOf(state: BoardState): TourSummary {
  const brief = state.brief;
  return {
    artist: brief?.artist ?? state.artist?.name ?? "",
    regions: brief?.regions ?? [],
    cities: state.cities.map((c) => ({ id: c.id, name: c.name, country: c.country, verdict: c.verdict, score: c.winnability.value })),
  };
}

const liveKey = (artistEntityId: string, cityId: string) => playbookKey(artistEntityId, cityId, undefined);

/** The finished live playbooks of this artist's cities, as the events that rebuild them. */
export function exportPlaybooks(artistEntityId: string, cities: ScoredCity[]): Record<string, GatewayEvent[]> {
  const out: Record<string, GatewayEvent[]> = {};
  for (const c of cities) {
    const s = getPlaybook(liveKey(artistEntityId, c.id));
    if (!s || s.status !== "done" || s.source !== "live" || s.cards.length === 0) continue;
    out[c.id] = [
      ...s.log,
      { type: "playbook", playbook: { city: { name: c.name, country: c.country }, cards: s.cards } },
      ...(s.narrative ? [{ type: "narrative", narrative: s.narrative } as GatewayEvent] : []),
      { type: "done", summary: {} },
    ];
  }
  return out;
}

/** Puts saved playbooks into the store as finished live ones (no request). */
export function seedPlaybooks(artistEntityId: string, cities: ScoredCity[], playbooks: Record<string, GatewayEvent[]>): void {
  for (const c of cities) {
    const evs = playbooks[c.id];
    if (!evs) continue;
    let s: PlaybookState = playbookReducer(initialPlaybook, { type: "start", source: "live" });
    for (const event of evs) s = playbookReducer(s, { type: "event", event });
    if (s.status === "done" && s.cards.length > 0) seedPlaybook(liveKey(artistEntityId, c.id), s);
  }
}
