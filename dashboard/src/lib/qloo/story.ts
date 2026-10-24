import { computeMoves } from "./moves";
import { showcaseCities, type Showcase } from "./showcase";
import { firstOkName } from "./playbookFacts";

export interface StoryBeats {
  decision: { artist: string; regions: string[]; markets: number };
  /** The city that climbs furthest when winnability is added to fan heat. Descriptive only: it says nothing about which ranking is better. */
  mover: { city: string; fanRank: number; winRank: number };
  plan: { city: string; sponsor: string | null; coBill: string | null };
}

/** The three-beat Landing story, every figure read from the recording. Null for the placeholder or a board where no city climbs. */
export function storyBeats(show: Showcase): StoryBeats | null {
  if (show.recordedAt === null) return null;
  const all = showcaseCities(show);
  const top = computeMoves(all).find((m) => m.delta > 0);
  if (!top) return null;
  const cards = show.playbooks[top.city.id]?.flatMap((e) => (e.type === "playbook" ? e.playbook.cards : [])) ?? [];
  return {
    decision: { artist: show.artist, regions: show.brief.regions, markets: all.length },
    mover: { city: top.city.name, fanRank: top.fanRank, winRank: top.winRank },
    plan: { city: top.city.name, sponsor: firstOkName(cards, "sponsors"), coBill: firstOkName(cards, "co_billing") },
  };
}
