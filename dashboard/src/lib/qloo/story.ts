import { VERDICT_LABEL } from "./labels";
import { boardRank, hasBothScores, showcaseCities, type Showcase } from "./showcase";
import type { PlaybookCard, ScoredCity } from "./types";

export interface StoryBeats {
  decision: { artist: string; regions: string[]; markets: number };
  missed: { city: string; densityRank: number; winnabilityRank: number; verdictLabel: string };
  plan: { city: string; sponsor: string | null; coBill: string | null; localAct: string | null };
}

const firstName = (cards: PlaybookCard[], kind: PlaybookCard["kind"]): string | null => {
  const name = cards.find((c) => c.kind === kind)?.items[0]?.name;
  return typeof name === "string" && name ? name : null;
};

/** The three-beat Landing story, every figure read from the recording. Null for the placeholder or a board with no climbing city. */
export function storyBeats(show: Showcase): StoryBeats | null {
  if (show.recordedAt === null) return null;
  const all = showcaseCities(show);
  const scored = all.filter(hasBothScores);
  const rows = scored.map((c) => ({ c, d: boardRank(scored, c, "fanHeat"), w: boardRank(scored, c, "winnability") }));
  const pick = (verdict: ScoredCity["verdict"]) => rows.filter((r) => r.c.verdict === verdict && r.d - r.w > 0).reduce<(typeof rows)[number] | null>((a, b) => (!a || b.d - b.w > a.d - a.w ? b : a), null);
  const best = pick("hidden_goldmine") ?? pick("play");
  if (!best) return null;
  const cards = show.playbooks[best.c.id]?.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) ?? [];
  return {
    decision: { artist: show.artist, regions: show.brief.regions, markets: all.length },
    missed: { city: best.c.name, densityRank: best.d, winnabilityRank: best.w, verdictLabel: VERDICT_LABEL[best.c.verdict] },
    plan: { city: best.c.name, sponsor: firstName(cards, "sponsors"), coBill: firstName(cards, "co_billing"), localAct: firstName(cards, "talent") },
  };
}
