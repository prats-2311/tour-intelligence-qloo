import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Caption, Row, Rows, TagChips } from "./rows";
import { num, str } from "./util";

const SOURCE_LABEL: Record<string, string> = { suggested: "Suggested · in Qloo", city_popular: "Popular in city" };

export function Talent({ card, city, artist }: { card: PlaybookCard; city: string; artist?: string }) {
  const sharedTaste = card.summary?.sharedTaste;
  const unresolvedRaw = card.summary?.suggestionsUnresolved;
  const unresolved = typeof unresolvedRaw === "number" && Number.isFinite(unresolvedRaw) ? unresolvedRaw : 0;
  const raw = card.summary?.sharedTags;
  const tags = Array.isArray(raw) ? raw.filter((t) => typeof t === "string" && t !== "") : [];
  const items = card.items;
  const suggestedAny = items.some((it) => it.source === "suggested");
  const unranked = card.summary?.rankUnavailable === true;
  const who = suggestedAny ? "candidates suggested by Gemini or popular in the city" : "popular in the city";
  const caption = unranked
    ? `Local acts: ${who}, each found in Qloo. Taste ranking was unavailable, so they are not ranked.`
    : `Local acts: ${who}, each found in Qloo and ranked by taste fit with ${artist || "the headliner"}.`;
  return (
    <>
      <div className="mb-2">
        <p className="text-[15px] font-medium tabular-nums text-canvas-text">
          {typeof sharedTaste === "number" ? `Shared taste with ${city}'s mainstream: ${fit(sharedTaste)}` : "Not enough shared taste data"}
        </p>
        {typeof sharedTaste === "number" && tags.length > 0 && <TagChips tags={tags} />}
      </div>
      <Rows>{items.map((it, i) => <Row key={i} name={str(it.name)} sub={SOURCE_LABEL[str(it.source)]} aside={unranked ? null : fit(num(it.affinity))} />)}</Rows>
      <Caption>{caption}</Caption>
      {unresolved > 0 && <p className="mt-1 text-[13px] text-canvas-muted">{unresolved === 1 ? "1 suggestion wasn't found in Qloo and is not shown." : `${unresolved} suggestions weren't found in Qloo and are not shown.`}</p>}
    </>
  );
}
