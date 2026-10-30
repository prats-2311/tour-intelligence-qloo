import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { carryQuery, pitchPath } from "@/lib/qloo/pitchLinks";
import type { PlaybookCard } from "@/lib/qloo/types";
import { dealLine, fanRankLine, fit, rankLine, SPONSORS_NOT_MAINSTREAM_NOTE } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";
import { SegmentControl } from "./SponsorSegments";
import type { SegmentRequest } from "@/lib/qloo/segmentStore";

/** Opens the one-page brief for this brand. Keeps the example set and workspace of the page it is on. */
export function PitchLink({ cityId, brand, search }: { cityId: string; brand: string; /** Query to carry; default is the current page's showcase/sample/ws. */ search?: string }) {
  const [params] = useSearchParams();
  return <Link to={pitchPath(cityId, brand, search ?? carryQuery(params))} aria-label={`Pitch sheet for ${brand}`} data-noprint className="inline-flex min-h-11 items-center text-[13px] text-canvas-muted underline decoration-canvas-line underline-offset-4 outline-none hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:min-h-0">Pitch sheet <span aria-hidden>→</span></Link>;
}

/** `segments`: the artist and city to ask for age groups. Absent (sample data, no artist id) means no control, only the all-fans list. */
export function Sponsors({ card, city, country, venueName, segments, pitchCityId }: { card: PlaybookCard; city: string; country?: string; venueName?: string; segments?: SegmentRequest; /** The city id for each row's "Pitch sheet" link; absent (the Tour Book list) means no link. */ pitchCityId?: string }) {
  const [open, setOpen] = useState(false);
  const shown = card.items.slice(0, open ? undefined : 5);
  const more = card.items.length - 5;
  const note = card.summary?.note;
  // The footer claim covers every visible item, including the "+N more": a city-ranked brand anywhere in the list withdraws it.
  const rankedAll = card.items.filter((it) => num(it.artistRank) !== null);
  const allOffChart = rankedAll.length > 0 && rankedAll.every((it) => num(it.cityRank) === null);
  const top = card.items.slice(0, 5).find((it) => num(it.artistRank) !== null);
  const deal = top ? dealLine(str(top.name), num(top.artistRank)!, num(top.cityRank), city, venueName) : null;
  const list = (
    <>
      <Rows>
        {shown.map((it, i) => {
          const a = num(it.artistRank);
          const action = pitchCityId && str(it.name) ? <PitchLink cityId={pitchCityId} brand={str(it.name)} /> : undefined;
          if (a === null) return <Row key={i} name={str(it.name)} action={action} aside={fit(num(it.affinity))} />;
          return <Row key={i} name={str(it.name)} action={action} aside={allOffChart ? fanRankLine(a) : rankLine(a, num(it.cityRank))} />;
        })}
      </Rows>
      {allOffChart && <Caption>{SPONSORS_NOT_MAINSTREAM_NOTE}</Caption>}
      {deal && <p data-testid="sponsor-deal" className="mt-2 text-[14px] font-medium text-canvas-text">{deal}</p>}
      {more > 0 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          {open ? "Show fewer" : `+${more} more`}
        </button>
      )}
      {typeof note === "string" && note !== "" && <Caption>{note}</Caption>}
    </>
  );
  return segments ? <SegmentControl request={segments} country={country ?? segments.city.country}>{list}</SegmentControl> : list;
}
