import type { PlaybookCard } from "@/lib/qloo/types";
import { fit, rankLine } from "../format";
import { Row, Rows, mapsLink } from "./rows";
import { num, str } from "./util";

const TYPE_LABEL: Record<string, string> = { artist: "Artist", place: "Place", movie: "Film", tv_show: "TV" };

/** Places only: film, TV and artist rows get no map link. */
const isPlace = (it: PlaybookCard["items"][number]) => str(it.category) === "place" || str(it.type) === "urn:entity:place";

export function LocalMoment({ card, city, country }: { card: PlaybookCard; city: string; country?: string }) {
  return (
    <>
    <p className="mb-2 text-[13px] text-canvas-muted">Film, TV, places and acts these fans rank highly in this city. Use them for local promo.</p>
    <Rows>
      {card.items.map((it, i) => (
        <Row key={i} name={str(it.name)} sub={TYPE_LABEL[str(it.category)]} aside={num(it.artistRank) === null ? fit(num(it.affinity)) : rankLine(num(it.artistRank)!, num(it.cityRank))} link={isPlace(it) && str(it.name) ? mapsLink(str(it.name), city, country) : undefined} />
      ))}
    </Rows>
    </>
  );
}
