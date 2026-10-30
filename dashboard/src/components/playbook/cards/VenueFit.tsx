import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Row, Rows, mapsLink } from "./rows";
import { num, str } from "./util";

export function VenueFit({ card, city, country }: { card: PlaybookCard; city: string; country?: string }) {
  return <Rows>{card.items.slice(0, 3).map((it, i) => <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} link={str(it.name) ? mapsLink(str(it.name), city, country) : undefined} />)}</Rows>;
}
