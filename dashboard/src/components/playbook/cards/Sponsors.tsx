import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

export function Sponsors({ card }: { card: PlaybookCard }) {
  const shown = card.items.slice(0, 5);
  const more = card.items.length - shown.length;
  return (
    <>
      <Rows>{shown.map((it, i) => <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />)}</Rows>
      {more > 0 && <Caption>+{more} more</Caption>}
    </>
  );
}
