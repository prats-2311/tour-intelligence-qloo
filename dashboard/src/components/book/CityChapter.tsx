import { useEffect, useRef, useState } from "react";
import { SampleBanner } from "@/components/qloo/SampleBanner";
import { Notice } from "@/components/qloo/Notice";
import { VerdictChip } from "@/components/qloo/VerdictChip";
import { VerdictClockLine } from "@/components/qloo/VerdictClockLine";
import { ChapterTeam } from "@/components/collab/ChapterTeam";
import { AdvanceSheet } from "@/components/playbook/AdvanceSheet";
import { CardBody, ThisWeekBody, isEmptyWeek } from "@/components/playbook/cardBody";
import { ClaimsBadge } from "@/components/playbook/ClaimsBadge";
import { CARD_TITLE, removalText } from "@/components/playbook/format";
import { KeyArtPoster } from "@/components/playbook/KeyArtPoster";
import { RadiusNote } from "@/components/qloo/RadiusNote";
import { LoadedBands } from "@/components/playbook/cards/SponsorSegments";
import { segmentKey, useSegments } from "@/lib/qloo/segmentStore";
import { visibleClaims } from "@/lib/qloo/doNotBook";
import { firstOkName } from "@/lib/qloo/playbookFacts";
import type { BookCityChapter } from "@/lib/qloo/tourBook";
import type { CardClaims, CardKind, DateWindow, ScoredCity } from "@/lib/qloo/types";

const ORDER: CardKind[] = ["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing", "talent"];
const TITLE: Record<CardKind, string> = { ...CARD_TITLE };

// Provenance travels with the text: on desktop the chip sits in the margin and brightens when its section is at the reading line.
function MarginNote({ requests, claims }: { requests: number; claims?: CardClaims }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const target = ref.current?.parentElement;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { for (const e of entries) setLit(e.isIntersecting); }, { rootMargin: "-40% 0px -50% 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  if (requests === 0 && !claims) return null;
  return (
    <div ref={ref} data-margin-note className={`margin-note flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums transition-colors motion-reduce:transition-none ${lit ? "text-bone" : "text-canvas-muted"}`}>
      {requests > 0 && <span className="inline-flex h-6 w-fit items-center rounded-[4px] bg-paper-raised px-2 font-medium">Qloo · {requests} {requests === 1 ? "request" : "requests"}</span>}
      {claims && <span>{claims.verified.length} verified · {claims.removed.length} removed</span>}
    </div>
  );
}

const H3 = "font-title text-[20px] leading-tight text-canvas-text";

export function CityChapter({ chapter, sample = false, showcase = false, artist, artistId, window, stops }: { chapter: BookCityChapter; sample?: boolean; showcase?: boolean; artist?: string; /** The artist's Qloo entity id: lets the chapter show age groups already loaded in this session (never loads them). */ artistId?: string; window?: DateWindow; /** The other cities on the tour, for the nearest-stop note. */ stops?: ScoredCity[] }) {
  const { city, accent, playbook, week } = chapter;
  const narrative = playbook?.narrative;
  const segments = useSegments(artistId ? segmentKey(artistId, city) : null);
  const ok = chapter.status === "ready";
  const merch = narrative?.status === "ok" ? narrative.merch : null;
  const claimsOf = (k: CardKind): CardClaims | undefined => (narrative?.status === "ok" ? visibleClaims(narrative.cards[k]) : undefined);
  const removed = narrative?.status === "ok" ? ORDER.flatMap((k) => (claimsOf(k)?.removed ?? []).map((r) => ({ kind: k, ...r }))) : [];
  return (
    <section id={`chapter-${city.id}`} aria-labelledby={`title-${city.id}`} className="book-chapter flex min-w-0 flex-col gap-4">
      <div className="relative [&_svg]:rounded-none lg:[&_svg]:rounded-[14px]">
        <KeyArtPoster city={city.name} accent={accent} ratio="4:5" />
        <span
          aria-hidden data-print-keep
          className="page-turn-rail absolute inset-y-0 left-0 w-2.5"
          style={{
            backgroundColor: accent,
            backgroundImage: "radial-gradient(circle, var(--color-canvas) 2.75px, transparent 3.25px)", // taste-skill-ignore: DESIGN 4.2 perforated rail
            backgroundSize: "100% 14px",
            backgroundRepeat: "repeat-y",
            backgroundPosition: "center 7px",
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 px-4 lg:px-0">
        <div className="flex min-w-0 flex-col gap-2">
          {sample && <SampleBanner compact source={showcase ? "showcase" : "sample"} />}
          <h2 id={`title-${city.id}`} className="font-title break-words text-[32px] leading-[1.1] text-canvas-text">{city.name}</h2>
          <div className="flex items-center gap-3"><VerdictChip verdict={city.verdict} size="md" /><span className="text-[13px] text-canvas-muted">{city.country}</span></div>
          <VerdictClockLine window={window} />
          <RadiusNote city={city} pool={stops ?? []} />
        </div>
        <ChapterTeam cityId={city.id} />
        {!ok ? (
          <Notice>Playbook incomplete — {chapter.incompleteReason ?? "Not loaded"}</Notice>
        ) : (
          <>
            <AdvanceSheet rows={chapter.advance} cityId={city.id} />
            {narrative?.status === "unavailable" && <Notice>{narrative.message}</Notice>}
            <div data-testid="chapter-sections" className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6">
            {ORDER.map((kind) => {
              const card = playbook?.cards.find((c) => c.kind === kind);
              if (!card) return null;
              const claims = claimsOf(kind);
              return (
                <section key={kind} data-section={kind} className="relative flex min-w-0 flex-col gap-3">
                  <h3 className={H3}>{TITLE[kind]}</h3>
                  {claims && claims.verified.map((c, i) => <p key={`${i}-${c.text}`} className="text-[15px] leading-[1.5] text-canvas-text">{c.text}</p>)}
                  {claims && card.status === "ok" && claims.verified.length === 0 && <p className="text-[13px] text-canvas-muted">Narrative removed: no claim passed verification.</p>}
                  <CardBody card={card} merch={merch} city={city.name} country={city.country} artist={artist} venueName={firstOkName(playbook?.cards ?? [], "venue_fit") ?? undefined} />
                  {kind === "sponsors" && segments.status === "done" && <LoadedBands data={segments.data} country={city.country} />}
                  <MarginNote requests={card.refs.length} claims={claims} />
                </section>
              );
            })}
            {!isEmptyWeek(week) && (
              <section data-section="this_week" className="relative flex min-w-0 flex-col gap-3">
                <h3 className={H3}>{CARD_TITLE.this_week}</h3>
                <ThisWeekBody week={week} />
              </section>
            )}
            </div>
            {chapter.claims && (
              <div className="flex flex-col gap-3 pt-4">
                <ClaimsBadge verified={chapter.claims.verified} removed={chapter.claims.removed} />
                {removed.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-[15px] font-semibold text-canvas-text">Removed claims</h3>
                    <ul className="flex flex-col gap-3">
                      {removed.map((r, i) => (
                        <li key={`${r.claim.text}-${i}`}>
                          <p className="text-[15px] leading-[1.45] text-canvas-muted line-through">{r.claim.text}</p>
                          <p className="mt-0.5 text-[13px] font-medium text-state-stale">{TITLE[r.kind]} · {removalText(r)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
