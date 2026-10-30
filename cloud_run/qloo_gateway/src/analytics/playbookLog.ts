import type { Analytics } from "./bigquery.js";
import { isTestTraffic, sha256 } from "./bigquery.js";
import { PUBLIC_SESSION_PREFIX } from "../budget.js";
import type { CardClaims, CardKind, GatewayEvent, Narrative, PlaybookCard } from "../types.js";

export interface PlaybookLogInput { sessionId: string; city: { id?: string; name: string; country: string }; narrative: boolean; /** x-tiq-test header was set */ test?: boolean }

const clip = (s: string): string => s.slice(0, 80);

/**
 * Passes the playbook's events through untouched and, when the stream ends, tracks one `playbook_runs` row of counts only.
 * Nothing the stream carries (artist, entity names, affinities) is copied into the row.
 */
export async function* observePlaybook(gen: AsyncGenerator<GatewayEvent>, input: PlaybookLogInput, analytics: Analytics, now: () => number = Date.now): AsyncGenerator<GatewayEvent> {
  if (!analytics.enabled) { yield* gen; return; }
  const started = now();
  let qlooCalls = 0, cacheHits = 0;
  let cardsOk: number | null = null, cardsEmpty: number | null = null, sponsorsHidden: number | null = null;
  let verified: number | null = null, removed: number | null = null;
  let narrativeStatus: string | null = input.narrative ? null : "skipped";
  let error: string | null = null;
  let done = false;
  try {
    for await (const ev of gen) {
      try {
        if (ev.type === "tool_call") { qlooCalls += 1; if (ev.cached) cacheHits += 1; }
        else if (ev.type === "playbook") {
          const cards = ((ev.playbook as { cards?: PlaybookCard[] }).cards ?? []);
          cardsOk = cards.filter((c) => c.status === "ok").length;
          cardsEmpty = cards.length - cardsOk;
          const s = cards.find((c) => (c.kind as CardKind) === "sponsors")?.summary?.hiddenNonSponsors;
          sponsorsHidden = typeof s === "number" ? s : 0;
        } else if (ev.type === "narrative") {
          const n: Narrative = ev.narrative;
          if (n.status === "ok") {
            const all = Object.values(n.cards) as CardClaims[];
            verified = all.reduce((t, c) => t + c.verified.length, 0);
            removed = all.reduce((t, c) => t + c.removed.length, 0);
            narrativeStatus = n.cached ? "cached" : "ok";
          } else narrativeStatus = n.reason;
        } else if (ev.type === "done") { done = true; if (narrativeStatus === null) narrativeStatus = "skipped"; }
        else if (ev.type === "error") error = ev.code;
      } catch { /* tallying must never break the stream */ }
      yield ev;
    }
  } finally {
    if (!done && !error) error = "ABORTED";
    analytics.track("playbook_runs", {
      session_hash: sha256(input.sessionId),
      source: input.sessionId.startsWith(PUBLIC_SESSION_PREFIX) ? "mcp_public" : "live",
      city_id: input.city.id ? clip(input.city.id) : null, city: clip(input.city.name), country: clip(input.city.country),
      verdict: null, // the playbook is built from a city already chosen; the board's verdict is not part of this call
      cards_ok: cardsOk, cards_empty: cardsEmpty, claims_verified: verified, claims_removed: removed, sponsors_hidden: sponsorsHidden,
      qloo_calls: qlooCalls, cache_hits: cacheHits, gemini_calls: null, latency_ms: Math.max(0, now() - started), narrative_status: narrativeStatus, error,
      test: input.test === true || isTestTraffic(input.sessionId),
    });
  }
}
