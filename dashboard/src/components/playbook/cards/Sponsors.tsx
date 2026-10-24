import type { PlaybookCard } from "@/lib/qloo/types";
import { fit, rankLine } from "../format";
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
          const a = num(it.artistRank);
          if (a === null) return <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />;
          return <Row key={i} name={str(it.name)} aside={rankLine(a, num(it.cityRank))} />;
        })}
      </Rows>
      {more > 0 && <Caption>+{more} more</Caption>}
      {typeof note === "string" && note !== "" && <Caption>{note}</Caption>}
    </>
  );
}
