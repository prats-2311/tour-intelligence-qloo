import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Caption, Row, Rows, TagChips } from "./rows";
import { num, str } from "./util";

export function Talent({ card, city, artist }: { card: PlaybookCard; city: string; artist?: string }) {
  const sharedTaste = card.summary?.sharedTaste;
  const raw = card.summary?.sharedTags;
  const tags = Array.isArray(raw) ? raw.filter((t) => typeof t === "string" && t !== "") : [];
  return (
    <>
      <div className="mb-2">
        <p className="text-[15px] font-medium tabular-nums text-canvas-text">
          {typeof sharedTaste === "number" ? `Shared taste with ${city}'s mainstream: ${fit(sharedTaste)}` : "Not enough shared taste data"}
        </p>
        {typeof sharedTaste === "number" && tags.length > 0 && <TagChips tags={tags} />}
      </div>
      <Rows>{card.items.map((it, i) => <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />)}</Rows>
      <Caption>{`Local acts: the city's most popular artists, ranked by taste fit with ${artist || "the headliner"}.`}</Caption>
    </>
  );
}
