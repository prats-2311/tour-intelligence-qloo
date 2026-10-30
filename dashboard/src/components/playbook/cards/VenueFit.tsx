import type { PlaybookCard } from "@/lib/qloo/types";
import { HINT, tiedFlags } from "@/lib/qloo/numberKey";
import { fit } from "../format";
import { Row, Rows, mapsLink } from "./rows";
import { num, str } from "./util";

export function VenueFit({ card, city, country }: { card: PlaybookCard; city: string; country?: string }) {
  const items = card.items.slice(0, 3);
  // Equal scores are not a ranking: say so instead of implying the first row is better.
  const tied = tiedFlags(items.map((it) => num(it.affinity) ?? Number.NaN));
  return <Rows>{items.map((it, i) => <Row key={i} name={str(it.name)} hint={HINT.venueFit} aside={tied[i] ? <>{fit(num(it.affinity))} <span className="text-[13px] text-canvas-muted">tied</span></> : fit(num(it.affinity))} link={str(it.name) ? mapsLink(str(it.name), city, country) : undefined} />)}</Rows>;
}
