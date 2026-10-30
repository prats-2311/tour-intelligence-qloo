import { tourFacts } from "@/lib/tour/tourSteps";
import { isHiddenItem } from "./doNotBook";
import type { Showcase } from "./showcase";
import type { PlaybookCard } from "./types";

/** Names of the first shown items of the first ok sponsors card, up to `n`; hidden (do-not-book) items are skipped. */
function topSponsors(show: Showcase, cityId: string, n: number): string[] {
  const cards: PlaybookCard[] = (show.playbooks[cityId] ?? []).flatMap((e) => (e.type === "playbook" ? e.playbook.cards : []));
  const items = cards.find((c) => c.kind === "sponsors" && c.status === "ok")?.items ?? [];
  return items.filter((it) => !isHiddenItem("sponsors", it)).flatMap((it) => (typeof it.name === "string" && it.name ? [it.name] : [])).slice(0, n);
}

const joinList = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Up to three live questions for the recorded example, with names read from the recording the same way the tour copy does, so they
 * cannot drift from the screen. A question whose names are missing is left out. Never matches a recorded question, so they run live.
 */
export function liveAskSuggestions(show: Showcase): string[] {
  const f = tourFacts(show);
  const out: string[] = [];
  if (f.coBill) out.push(`Compare ${f.artist} and ${f.coBill.name} fans`);
  if (f.playbookCity) {
    out.push(`Where in ${f.playbookCity.name} are these fans concentrated?`);
    const sponsors = topSponsors(show, f.playbookCity.id, 3);
    if (sponsors.length >= 2) out.push(`Rank ${joinList(sponsors)} for this audience`);
  }
  return out;
}
