import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

export function Talent({ card, city }: { card: PlaybookCard; city: string }) {
  const overlap = card.summary?.overlap;
  return (
    <>
      <p className="mb-2 text-[15px] font-medium tabular-nums text-canvas-text">
        {typeof overlap === "number" ? `Overlap with ${city}'s mainstream: ${fit(overlap)}` : "Overlap not returned"}
      </p>
      <Rows>{card.items.map((it, i) => <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />)}</Rows>
      <Caption>City mainstream = top artists in the city without the artist signal</Caption>
    </>
  );
}
