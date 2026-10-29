import type { PlaybookCard } from "@/lib/qloo/types";
import { dealLine, fanRankLine, fit, rankLine, SPONSORS_NOT_MAINSTREAM_NOTE } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

export function Sponsors({ card, city, venueName }: { card: PlaybookCard; city: string; venueName?: string }) {
  const shown = card.items.slice(0, 5);
  const more = card.items.length - shown.length;
  const note = card.summary?.note;
  // The footer claim covers every visible item, including the "+N more": a city-ranked brand anywhere in the list withdraws it.
  const rankedAll = card.items.filter((it) => num(it.artistRank) !== null);
  const allOffChart = rankedAll.length > 0 && rankedAll.every((it) => num(it.cityRank) === null);
  const top = shown.find((it) => num(it.artistRank) !== null);
  const deal = top ? dealLine(str(top.name), num(top.artistRank)!, num(top.cityRank), city, venueName) : null;
  return (
    <>
      <Rows>
        {shown.map((it, i) => {
          const a = num(it.artistRank);
          if (a === null) return <Row key={i} name={str(it.name)} aside={fit(num(it.affinity))} />;
          return <Row key={i} name={str(it.name)} aside={allOffChart ? fanRankLine(a) : rankLine(a, num(it.cityRank))} />;
        })}
      </Rows>
      {allOffChart && <Caption>{SPONSORS_NOT_MAINSTREAM_NOTE}</Caption>}
      {deal && <p data-testid="sponsor-deal" className="mt-2 text-[14px] font-medium text-canvas-text">{deal}</p>}
      {more > 0 && <Caption>+{more} more</Caption>}
      {typeof note === "string" && note !== "" && <Caption>{note}</Caption>}
    </>
  );
}
