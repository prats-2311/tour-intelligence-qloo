import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PlaybookSkeleton } from "@/components/ui/Skeletons";
import { ShowcaseUnavailable } from "@/components/qloo/ShowcaseUnavailable";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { fetchThisWeek } from "@/lib/qloo/client";
import { SAMPLE_BRIEF, SAMPLE_CITIES, LONG_NAMES_BRIEF } from "@/lib/qloo/fixtures/lumenVale";
import { carryQuery } from "@/lib/qloo/pitchLinks";
import { buildPitchSheet, pitchSheetText, DRAFT_FOOTER, type PitchSheetOk } from "@/lib/qloo/pitchSheet";
import { initialPlaybook } from "@/lib/qloo/playbookReducer";
import { playbookKey, usePlaybook, usePlaybookSnapshot, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { segmentKey, useSegments } from "@/lib/qloo/segmentStore";
import { isRoutingBrief, setShowcaseVariant, showcaseAvailable, showcaseBrief, showcaseCities, showcaseParam, showcasePlaybookEvents, showcaseQuery, SHOWCASE, variantOfBrief, type ShowcaseVariant } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useOpenExampleRun, useWantsExample } from "@/lib/qloo/useOpenExampleRun";
import { useEffect, useRef } from "react";
import type { SampleSet } from "@/lib/qloo/types";

const btn = "inline-flex min-h-11 items-center justify-center rounded-[8px] bg-paper-raised px-4 text-[14px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const H2 = "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted";
const muted = "text-[13px] text-canvas-muted";
const SAMPLE_PLAYBOOK_DELAY_MS = 10;

export default function PitchSheet() {
  const [params] = useSearchParams();
  if (showcaseParam(params.get("showcase")) !== null && !showcaseAvailable()) return <ShowcaseUnavailable sampleHref={`/tours/pitch/${SAMPLE_CITIES[2]!.id}?sample=1`} />;
  return <PitchSheetPage />;
}

function PitchSheetPage() {
  const { cityId = "", brand = "" } = useParams();
  const { state, run } = useTourBoard();
  const [params] = useSearchParams();
  const ws = useWorkspace();
  const sampleParam = params.get("sample");
  const wantLong = sampleParam === "long";
  const showParam = showcaseParam(params.get("showcase"));
  const wantShowcase = showParam !== null;
  const wantRouting = showParam === "routing" && SHOWCASE.routing !== null;
  setShowcaseVariant(wantRouting ? "routing" : "main");
  const wantSample = sampleParam === "1" || wantLong || wantShowcase;
  const wantSet: SampleSet = wantShowcase ? "showcase" : wantLong ? "long" : "default";
  // The URL decides; a run already held on the board is the fallback, so Back never drops the example.
  const heldQ = state.source === "showcase" ? showcaseQuery(isRoutingBrief(state.brief)) : state.source === "sample" ? (state.sampleSet === "long" ? "?sample=long" : "?sample=1") : "";
  const carry = carryQuery(params, heldQ);
  const variant: ShowcaseVariant = wantShowcase ? (wantRouting ? "routing" : "main") : state.source === "showcase" ? variantOfBrief(state.brief) : "main";
  const bareExample = useWantsExample(!wantSample);
  useOpenExampleRun(bareExample);
  const setKey = `${wantSet}|${wantRouting ? "routing" : ""}`;
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!wantSample || started.current === setKey) return;
    started.current = setKey;
    if (state.source === "live" || (state.sampleSet ?? "default") !== wantSet || (wantShowcase && isRoutingBrief(state.brief) !== wantRouting)) run(wantShowcase ? showcaseBrief() : wantLong ? LONG_NAMES_BRIEF : SAMPLE_BRIEF, { sample: true, sampleSet: wantSet });
  }, [wantSample, wantLong, wantSet, wantRouting, wantShowcase, setKey, state.source, state.sampleSet, state.brief, run]);

  const sample = state.source !== "live";
  const ready = !wantSample || (sample && (state.sampleSet ?? "default") === wantSet && (!wantShowcase || isRoutingBrief(state.brief) === wantRouting));
  const city = ready ? state.cities.find((c) => c.id === cityId) : undefined;
  const shownCity = city ?? (wantSample ? (wantShowcase ? showcaseCities(undefined, variant) : SAMPLE_CITIES).find((c) => c.id === cityId) : undefined);
  const artist = ready ? state.artist : undefined;
  const unrecorded = (wantShowcase || state.source === "showcase") && ready && !!shownCity && showcasePlaybookEvents(cityId, variant) === null;
  const req: PlaybookRequest | null = shownCity && artist && !unrecorded
    ? { artist: artist.name, artistEntityId: artist.entityId, artistPopularity: artist.popularity, city: { id: shownCity.id, name: shownCity.name, country: shownCity.country, lat: shownCity.lat, lon: shownCity.lon }, sample, sampleSet: state.sampleSet, ...(variant === "routing" ? { variant } : {}), delayMs: sample ? (state.sampleSet === "showcase" ? 0 : SAMPLE_PLAYBOOK_DELAY_MS) : undefined }
    : null;
  // Recorded and sample playbooks replay from memory; a live run only reads what its playbook page already loaded (never a new Qloo call).
  const replayed = usePlaybook(sample ? req : null);
  const held = usePlaybookSnapshot(req ? playbookKey(req.artistEntityId, req.city.id, req.sampleSet, req.variant) : "");
  const pb = sample ? replayed : held ?? initialPlaybook;
  const window = state.brief?.dateWindow;
  // Same key as the playbook page, so a live run's already-fetched week is read from cache; only the sample sets fetch (from memory).
  const week = useQuery({
    queryKey: ["this-week", sample, state.sampleSet, variant, cityId, window?.start, window?.end],
    queryFn: () => fetchThisWeek({ city: shownCity!.name, country: shownCity!.country, window }, { sample, sampleSet: state.sampleSet, ...(variant === "routing" ? { variant } : {}), cityId }),
    enabled: sample && !!shownCity && !!artist && !unrecorded,
    staleTime: Infinity,
    retry: false,
  });
  const segments = useSegments(artist && shownCity ? segmentKey(artist.entityId, { id: shownCity.id, name: shownCity.name, country: shownCity.country }) : null);
  const today = useMemo(() => new Date(), []);

  // A requested example that has not started (or a run of another set still held) shows nothing from the earlier run.
  if (!ready) return <PlaybookSkeleton />;
  const back = <Link to={`/tours/playbook/${cityId}${carry}`} className={btn}>Back to playbook</Link>;
  if (!shownCity) {
    if (state.status === "streaming" || !ready || bareExample) return <PlaybookSkeleton />;
    return <Plain>{<p className={muted}>Pitch sheets are built from a scored run. Open this city from a Tour Board.</p>}<Link to="/tours/board" className={btn}>Go to Tour Board</Link></Plain>;
  }
  if (!artist || unrecorded || pb.status === "error" || pb.status === "interrupted") return <Plain><p className={muted}>The playbook for {shownCity.name} isn't loaded, so there is nothing to build a sheet from. Open it on the playbook first.</p>{back}</Plain>;
  // Built only from a finished playbook: cards arrive one by one and the narrative last, so a partial one would change under the reader.
  if (pb.status !== "done") return <PlaybookSkeleton />;

  const sheet = buildPitchSheet({
    brand, artist: artist.name, city: { id: shownCity.id, name: shownCity.name, country: shownCity.country }, cards: pb.cards,
    source: state.source === "live" ? "live" : state.source === "showcase" ? "showcase" : "sample", recordedAt: SHOWCASE.recordedAt, today,
    segments: segments.status === "done" ? segments.data : null, week: week.data, narrative: pb.narrative ?? undefined, snapshot: ws.enabled ? ws.snapshot : null,
  });
  if (sheet.status === "unavailable") return <Plain><p className="text-[15px] text-canvas-text">{sheet.message}</p>{back}</Plain>;
  return <Sheet sheet={sheet} back={back} />;
}

function Plain({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3 py-10">{children}</div>;
}

function Sheet({ sheet, back }: { sheet: PitchSheetOk; back: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pitchSheetText(sheet)); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  };
  return (
    <article className="pitch-sheet mx-auto flex w-full max-w-[820px] flex-col gap-5 rounded-[18px] bg-paper p-5 pb-8 md:p-8">
      <div data-pitch-actions data-noprint className="flex flex-wrap items-center gap-2">
        {back}
        <button type="button" onClick={() => window.print()} className={btn}>Print / Save as PDF</button>
        <button type="button" onClick={() => void copy()} className={btn}>{copied ? "Copied" : "Copy as text"}</button>
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="font-title break-words text-[30px] leading-[1.1] text-canvas-text">{sheet.title}</h1>
        <p className={muted}>{sheet.date} · {sheet.preparedWith}</p>
      </header>
      <section aria-labelledby="ps-why" className="flex flex-col gap-1">
        <h2 id="ps-why" className={H2}>Why this brand</h2>
        <p className="text-[17px] leading-[1.45] text-canvas-text">{sheet.why}</p>
      </section>
      <section aria-labelledby="ps-who" className="flex flex-col gap-1">
        <h2 id="ps-who" className={H2}>Who loves it most</h2>
        {sheet.segments.state === "bands" ? (
          <>
            <ul className="text-[15px] text-canvas-text">{sheet.segments.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {sheet.segments.note && <p className={muted}>{sheet.segments.note}</p>}
          </>
        ) : <p className={muted}>{sheet.segments.message}</p>}
      </section>
      <section aria-labelledby="ps-where" className="flex flex-col gap-1">
        <h2 id="ps-where" className={H2}>Where the fans are</h2>
        {sheet.zones.length === 0 ? <p className={muted}>No neighbourhood data.</p> : (
          <>
            <ul className="text-[15px] text-canvas-text">{sheet.zones.map((z) => <li key={z.label} className="flex justify-between gap-3 py-0.5"><span>{z.label}</span><span className="tabular-nums">{z.share}</span></li>)}</ul>
            <p className={muted}>Share of in-city fan heat.</p>
          </>
        )}
      </section>
      <section aria-labelledby="ps-night" className="flex flex-col gap-1">
        <h2 id="ps-night" className={H2}>The night</h2>
        {sheet.room && <p className="text-[15px] text-canvas-text">Best room: {sheet.room.name} (fit {sheet.room.fit})</p>}
        {sheet.opener && <p className="text-[15px] text-canvas-text">Suggested opening act: {sheet.opener}</p>}
        {!sheet.room && !sheet.opener && <p className={muted}>No room or opening-act data for this city.</p>}
      </section>
      {sheet.week.length > 0 && (
        <section aria-labelledby="ps-week" className="flex flex-col gap-1">
          <h2 id="ps-week" className={H2}>This week in the city</h2>
          <ul className="text-[15px] text-canvas-text">
            {sheet.week.map((w, i) => (
              <li key={i} className="py-0.5">{w.text}{w.date && <span className="text-canvas-muted"> · {w.date}</span>}{w.links.map((l) => <a key={l.n} data-cite href={l.href} target="_blank" rel="noreferrer" className="ml-1.5 underline decoration-canvas-muted underline-offset-4">[{l.n}]</a>)}</li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Suggested activation" className="flex flex-col gap-1 rounded-[12px] bg-canvas-raised p-3">
        <p className={H2}>{sheet.activation.label}</p>
        <p className="text-[16px] font-medium text-canvas-text">{sheet.activation.text}</p>
      </section>
      <section aria-labelledby="ps-ev" className="flex flex-col gap-1">
        <h2 id="ps-ev" className={H2}>Evidence and trust</h2>
        {sheet.claims && <p className="text-[15px] tabular-nums text-canvas-text">Sponsors card claims: {sheet.claims}</p>}
        <p className={muted}>{sheet.evidence}</p>
      </section>
      {sheet.team && (
        <section aria-labelledby="ps-team" className="flex flex-col gap-1">
          <h2 id="ps-team" className={H2}>Team</h2>
          <p className="text-[15px] text-canvas-text">{sheet.team}</p>
        </section>
      )}
      <footer className="border-t border-canvas-line pt-3 text-[13px] text-canvas-muted">{DRAFT_FOOTER}</footer>
    </article>
  );
}
