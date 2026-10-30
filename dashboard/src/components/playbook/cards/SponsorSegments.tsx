import { useState } from "react";
import { HIDDEN_ORGS_NOTE, SPONSOR_CHECK_UNAVAILABLE_NOTE } from "@/lib/qloo/nonSponsors";
import { BAND_LABEL, bandHeader, differLine, displayItems, NO_SKEW_COPY, SEGMENT_UNAVAILABLE_COPY, showsUnder21Note, UNDER_21_NOTE, type AgeBand, type SegmentBand, type SponsorSegments as Segments } from "@/lib/qloo/segments";
import { loadSegments, segmentKey, useSegments, type SegmentRequest } from "@/lib/qloo/segmentStore";
import { fanRankLine, rankLine } from "../format";
import { Caption, Row, Rows } from "./rows";

const CHIP = "inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const chip = (on: boolean) => `${CHIP} ${on ? "bg-bone text-canvas" : "bg-paper-raised text-canvas-text"}`;

/** One age band's ranked list, in the sponsors card's row format. Display filters apply here too. */
export function BandList({ band, country }: { band: SegmentBand; country?: string }) {
  const [open, setOpen] = useState(false);
  const { items, hiddenOrgs } = displayItems(band);
  const shown = items.slice(0, open ? undefined : 5);
  const more = items.length - 5;
  // Same rule as the main card: when no listed brand is in the city's top 20, every row reads "Fans rank it #N".
  const offChart = !band.lifted || items.every((it) => it.cityRank === null);
  return (
    <div data-testid="segment-band" data-band={band.band}>
      <p data-testid="segment-header" className="text-[13px] text-canvas-muted">{bandHeader(band.band, band.index)}</p>
      {showsUnder21Note(country, band.band) && <p data-testid="under-21-note" className="mt-2 text-[13px] text-canvas-text">{UNDER_21_NOTE}</p>}
      {band.status === "unavailable" ? (
        <p data-testid="segment-unavailable" className="mt-2 text-[13px] text-canvas-muted">{SEGMENT_UNAVAILABLE_COPY}</p>
      ) : (
        <>
          {items.length > 0 && (
            <Rows>
              {shown.map((it, i) => <Row key={`${it.entityId}-${i}`} name={it.name} aside={offChart ? fanRankLine(it.artistRank) : rankLine(it.artistRank, it.cityRank)} />)}
            </Rows>
          )}
          {items.length === 0 && hiddenOrgs === 0 && <p className="mt-2 text-[13px] text-canvas-muted">Qloo returned no brands for this segment.</p>}
          {band.lifted && <Caption>City ranks are for fans of the same age group.</Caption>}
          {band.newInTop5 !== null && items.length > 0 && <p data-testid="segment-differ" className="mt-2 text-[14px] font-medium text-canvas-text">{differLine(band.newInTop5)}</p>}
          {more > 0 && (
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              {open ? "Show fewer" : `+${more} more`}
            </button>
          )}
          {hiddenOrgs > 0 && <p className="mt-2 text-[13px] text-canvas-muted">{HIDDEN_ORGS_NOTE(hiddenOrgs)}</p>}
          {band.sponsorCheck === "unavailable" && <p className="mt-2 text-[13px] text-canvas-muted">{SPONSOR_CHECK_UNAVAILABLE_NOTE}</p>}
        </>
      )}
    </div>
  );
}

/** The band lists once loaded, one under the other, for the Tour Book (read only, printable). */
export function LoadedBands({ data, country }: { data: Segments; country?: string }) {
  if (data.status !== "ok" || data.bands.length === 0) return null;
  return (
    <div data-testid="book-segments" className="flex flex-col gap-3">
      <h4 className="text-[15px] font-semibold text-canvas-text">Sponsors by age group</h4>
      {data.bands.map((b) => <BandList key={b.band} band={b} country={country} />)}
    </div>
  );
}

/**
 * "All fans | age bands" control for the sponsors card. The bands are not known until Qloo answers, so the control starts as
 * "All fans | By age group"; nothing is fetched until "By age group" is pressed, and the answer then replaces that button with the bands.
 */
export function SegmentControl({ request, country, children }: { request: SegmentRequest; country: string; children: React.ReactNode }) {
  const key = segmentKey(request.artistId, request.city);
  const state = useSegments(key);
  const [view, setView] = useState<"all" | AgeBand>("all");
  const [asked, setAsked] = useState(false);
  const data = state.status === "done" ? state.data : null;
  const bands = data?.status === "ok" ? data.bands : [];
  const loading = asked && state.status === "loading";
  const failed = asked && data?.status === "unavailable";
  const noSkew = asked && data?.status === "no_skew";
  const showBands = bands.length > 0;
  const open = () => {
    setAsked(true);
    void loadSegments(request).then((s) => { if (s.status === "done" && s.data.status === "ok" && s.data.bands[0]) setView((v) => (v === "all" ? s.data.bands[0]!.band : v)); });
  };
  const current = bands.find((b) => b.band === view);
  return (
    <>
      <div role="group" aria-label="Age group" data-testid="segment-control" className="mb-2 flex flex-wrap gap-2" data-noprint>
        <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")} className={chip(view === "all")}>All fans</button>
        {showBands
          ? bands.map((b) => <button key={b.band} type="button" aria-pressed={view === b.band} onClick={() => setView(b.band)} className={chip(view === b.band)}>{BAND_LABEL[b.band]}</button>)
          : !noSkew && <button type="button" aria-pressed={loading} disabled={loading} onClick={open} className={chip(false)}>By age group</button>}
      </div>
      {noSkew && <p data-testid="segment-no-skew" className="mb-2 text-[13px] text-canvas-muted">{NO_SKEW_COPY}</p>}
      {failed && <p data-testid="segment-unavailable" className="mb-2 text-[13px] text-canvas-muted">{SEGMENT_UNAVAILABLE_COPY}</p>}
      {loading && <div data-testid="segment-skeleton" aria-busy="true" aria-label="Loading age groups" className="mb-2 flex flex-col gap-2"><div className="skeleton h-4 w-3/4 rounded-md" /><div className="skeleton h-11 w-full rounded-md" /><div className="skeleton h-11 w-full rounded-md" /></div>}
      {current ? <BandList band={current} country={country} /> : children}
    </>
  );
}
