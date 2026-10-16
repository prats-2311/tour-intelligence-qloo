import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Row, Rows } from "./rows";
import { num, str } from "./util";

export function VenueFit({ card }: { card: PlaybookCard }) {
  return <Rows>{card.items.slice(0, 3).map((it, i) => <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />)}</Rows>;
}
