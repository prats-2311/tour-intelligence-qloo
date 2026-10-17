import type { MerchDirection, PlaybookCard } from "@/lib/qloo/types";
import { DataWarningBadge } from "@/components/qloo/DataWarningBadge";
import { CARD_TITLE } from "./format";
import { CoBilling } from "./cards/CoBilling";
import { LocalMoment } from "./cards/LocalMoment";
import { Merch } from "./cards/Merch";
import { PromoZones } from "./cards/PromoZones";
import { Sponsors } from "./cards/Sponsors";
import { Talent } from "./cards/Talent";
import { VenueFit } from "./cards/VenueFit";

export { ThisWeekBody } from "./cards/ThisWeek";

export function CardBody({ card, merch, city, artist }: { card: PlaybookCard; merch?: MerchDirection | null; city: string; artist?: string }) {
  const empty = card.status === "empty" && card.kind !== "promo_zones";
  let body;
  if (empty) {
    body = <p className="text-[13px] text-canvas-muted">Qloo returned no {CARD_TITLE[card.kind].toLowerCase()} for {city}</p>;
  } else {
    switch (card.kind) {
      case "sponsors": body = <Sponsors card={card} />; break;
      case "merch": body = <Merch card={card} merch={merch} />; break;
      case "promo_zones": body = <PromoZones card={card} city={city} />; break;
      case "local_moment": body = <LocalMoment card={card} />; break;
      case "venue_fit": body = <VenueFit card={card} />; break;
      case "co_billing": body = <CoBilling card={card} />; break;
      case "talent": body = <Talent card={card} city={city} artist={artist} />; break;
    }
  }
  return (
    <div>
      {card.warnings.length > 0 && <div className="mb-2"><DataWarningBadge warnings={card.warnings} /></div>}
      {body}
    </div>
  );
}
