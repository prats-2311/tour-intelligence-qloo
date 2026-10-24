import type { PlaybookCard } from "@/lib/qloo/types";
import { fit, liftVsCity } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

export function Sponsors({ card }: { card: PlaybookCard }) {
  const shown = card.items.slice(0, 5);
  const more = card.items.length - shown.length;
  const note = card.summary?.note;
  return (
    <>
      <Rows>
        {shown.map((it, i) => {
          const lift = num(it.lift);
          if (lift === null) return <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />;
          const sub = `fit ${fit(num(it.affinity))}${it.baselineMissing === true ? " · not in the city's baseline list" : ""}`;
          return <Row key={i} name={str(it.name)} sub={sub} aside={liftVsCity(lift)} />;
        })}
      </Rows>
      {more > 0 && <Caption>+{more} more</Caption>}
      {typeof note === "string" && note !== "" && <Caption>{note}</Caption>}
    </>
  );
}
