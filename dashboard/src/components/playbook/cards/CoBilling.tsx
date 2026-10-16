import type { PlaybookCard } from "@/lib/qloo/types";
import { liftLine } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

export function CoBilling({ card }: { card: PlaybookCard }) {
  return (
    <>
      <Rows>
        {card.items.map((it, i) => {
          const o = num(it.overlap), a = num(it.localAffinity), l = num(it.lift);
          return <Row key={i} name={str(it.name)} aside={o !== null && a !== null && l !== null ? liftLine(o, a, l) : "—"} />;
        })}
      </Rows>
      <Caption>lift = audience overlap × local affinity</Caption>
    </>
  );
}
