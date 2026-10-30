import type { MerchDirection, PlaybookCard } from "@/lib/qloo/types";
import { HIDDEN_NOTE, applyDoNotBook } from "@/lib/qloo/doNotBook";
import { HIDDEN_ORGS_NOTE, SPONSOR_CHECK_UNAVAILABLE_NOTE } from "@/lib/qloo/nonSponsors";
import { DataWarningBadge } from "@/components/qloo/DataWarningBadge";
import type { SegmentRequest } from "@/lib/qloo/segmentStore";
import { CARD_TITLE } from "./format";
import { CoBilling } from "./cards/CoBilling";
import { LocalMoment } from "./cards/LocalMoment";
import { Merch } from "./cards/Merch";
import { PromoZones } from "./cards/PromoZones";
import { Sponsors } from "./cards/Sponsors";
import { Talent } from "./cards/Talent";
import { VenueFit } from "./cards/VenueFit";

export { ThisWeekBody, isEmptyWeek } from "./cards/ThisWeek";

export function CardBody({ card: fullCard, merch, city, country, artist, venueName, segments, pitchCityId }: { card: PlaybookCard; merch?: MerchDirection | null; city: string; country?: string; artist?: string; /** First ok venue_fit name of the same playbook, for the sponsor deal line. */ venueName?: string; /** Sponsors card only: where to ask for age groups. Absent means no age control. */ segments?: SegmentRequest; /** Sponsors card only: the city id that turns each brand row into a "Pitch sheet" link. */ pitchCityId?: string }) {
  const { card, hidden, hiddenOrgs } = applyDoNotBook(fullCard);
  const empty = card.status === "empty" && card.kind !== "promo_zones";
  let body;
  const emptyCopy = card.summary?.emptyCopy;
  if (empty) {
    body = typeof emptyCopy === "string" && emptyCopy !== ""
      ? <p className="text-[13px] text-canvas-muted">{emptyCopy}</p>
      : card.kind === "venue_fit"
      ? <p className="text-[13px] text-canvas-muted">Qloo lists no music venues in {city} for this artist</p>
      : <p className="text-[13px] text-canvas-muted">Qloo returned no {card.kind === "local_moment" ? "fan picks" : CARD_TITLE[card.kind].toLowerCase()} for {city}</p>;
  } else if (hidden + hiddenOrgs > 0 && card.items.length === 0) {
    body = null; // every act was hidden: the note below is the whole card
  } else {
    switch (card.kind) {
      case "sponsors": body = <Sponsors card={card} city={city} country={country} venueName={venueName} segments={segments} pitchCityId={pitchCityId} />; break;
      case "merch": body = <Merch card={card} merch={merch} />; break;
      case "promo_zones": body = <PromoZones card={card} city={city} country={country} />; break;
      case "local_moment": body = <LocalMoment card={card} city={city} country={country} />; break;
      case "venue_fit": body = <VenueFit card={card} city={city} country={country} />; break;
      case "co_billing": body = <CoBilling card={card} />; break;
      case "talent": body = <Talent card={card} city={city} artist={artist} />; break;
    }
  }
  return (
    <div>
      {card.warnings.length > 0 && <div className="mb-2"><DataWarningBadge warnings={card.warnings} /></div>}
      {body}
      {hidden > 0 && <p className="mt-2 text-[13px] text-canvas-muted">{HIDDEN_NOTE(hidden)}</p>}
      {hiddenOrgs > 0 && <p className="mt-2 text-[13px] text-canvas-muted">{HIDDEN_ORGS_NOTE(hiddenOrgs)}</p>}
      {card.kind === "sponsors" && card.summary?.sponsorCheck === "unavailable" && <p className="mt-2 text-[13px] text-canvas-muted">{SPONSOR_CHECK_UNAVAILABLE_NOTE}</p>}
    </div>
  );
}
