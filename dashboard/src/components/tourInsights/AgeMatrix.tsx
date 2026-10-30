import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { buildAgeMatrix, indexRangeText, matrixSummary, type AllFansBrand, type MatrixCell, type MatrixRow } from "@/lib/qloo/ageMatrix";
import { loadAllSegments, MATRIX_MAX_CITIES } from "@/lib/qloo/ageMatrixLoader";
import { BAND_LABEL, type AgeBand } from "@/lib/qloo/segments";
import { loadSegments, segmentKey, useSegmentsMany, type SegmentRequest } from "@/lib/qloo/segmentStore";
import type { ScoredCity } from "@/lib/qloo/types";

export const MATRIX_TITLE = "Which brands each age group loves, city by city";
const running0 = (p: { done: number; total: number } | null) => p !== null && p.done < p.total;
export const MATRIX_UNAVAILABLE = "Age groups need the live service. Try again.";
export const MATRIX_COST_NOTE = "Runs live Qloo lookups, about 5 per city the first time; cached after.";

const btn = "inline-flex min-h-11 items-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const th = "whitespace-nowrap border-b border-canvas-line px-2 py-2 align-bottom font-normal";

interface Props {
  /** Cities as shown on the page (filters and sort already applied). Only the first 10 are used. */
  cities: ScoredCity[];
  artist: { entityId: string; name: string } | null | undefined;
  /** The city's all-fans sponsors from the playbook already in memory, or null when there is none. */
  allFansOf: (city: ScoredCity) => AllFansBrand[] | null;
  /** Link to the city's playbook (Sponsors card), with the band preselected when given; null when the city has no playbook. */
  hrefFor: (cityId: string, band?: AgeBand) => string | null;
}

export function AgeMatrix({ cities, artist, allFansOf, hrefFor }: Props) {
  const rows = useMemo(() => cities.slice(0, MATRIX_MAX_CITIES), [cities]);
  const requests = useMemo((): SegmentRequest[] => (artist ? rows.map((c) => ({ artistId: artist.entityId, artist: artist.name, city: { id: c.id, name: c.name, country: c.country, lat: c.lat, lon: c.lon } })) : []), [artist, rows]);
  const states = useSegmentsMany(requests.map((r) => segmentKey(r.artistId, r.city)));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<{ cityId: string; band: AgeBand } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => { if (open) popRef.current?.focus(); }, [open]);
  const retryAll = useRef<HTMLButtonElement>(null);

  const matrix = useMemo(() => buildAgeMatrix(rows.map((c, i) => ({ id: c.id, name: c.name, segments: states[i] ?? { status: "idle" as const }, allFans: allFansOf(c) }))), [rows, states, allFansOf]);
  const allFailed = matrix.rows.length > 0 && matrix.rows.every((r) => r.state === "unavailable");
  const resolved = matrix.rows.some((r) => r.state !== "idle" && r.state !== "loading");
  // One banner instead of N identical per-row errors; keep keyboard focus where the visitor was (on the button they pressed, now replaced by Retry).
  useEffect(() => { if (allFailed && !running0(progress)) { const a = document.activeElement; if (!a || a === document.body) retryAll.current?.focus(); } }, [allFailed, progress]);
  if (!artist || rows.length === 0) return null;

  const touched = states.some((s) => s.status !== "idle");
  const someIdle = states.some((s) => s.status === "idle");
  const running = progress !== null && progress.done < progress.total;
  const run = () => { setProgress({ done: 0, total: requests.length }); void loadAllSegments(requests, { onProgress: (p) => setProgress({ done: p.done, total: p.total }) }); };
  const summary = matrixSummary(matrix);
  const noun = rows.length === 1 ? "city" : "cities";
  const cellOf = open ? matrix.rows.find((r) => r.cityId === open.cityId)?.cells[open.band] : undefined;
  const openCity = open ? rows.find((c) => c.id === open.cityId) : undefined;
  const close = () => { setOpen(null); trigger.current?.focus(); };

  return (
    <section data-testid="age-matrix" data-tour="age-matrix" aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 id={titleId} className="font-title text-[20px] leading-tight text-canvas-text">{MATRIX_TITLE}</h2>
      <p className="text-[12px] leading-[1.45] text-canvas-muted">Each age group's #1 brand in each city, from the age bands where fans of this artist over-index. Header ranges are Qloo's signed index values, not shares of fans.</p>
      {(!touched || someIdle) && !running && (
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={run} className={btn}>{`Load age groups for all ${rows.length} ${noun}`}</button>
          <p className="text-[12px] text-canvas-muted">{MATRIX_COST_NOTE}</p>
        </div>
      )}
      {running && <p role="status" className="text-[13px] text-canvas-muted">Loaded {progress!.done} of {progress!.total} {progress!.total === 1 ? "city" : "cities"}…</p>}
      {allFailed && !running && (
        <div role="alert" data-testid="matrix-unavailable" className="flex flex-col items-start gap-2 rounded-[10px] border border-canvas-line bg-paper-raised p-3">
          <p className="text-[14px] text-canvas-text">{MATRIX_UNAVAILABLE}</p>
          <button ref={retryAll} type="button" onClick={run} className={btn}>Retry</button>
        </div>
      )}
      {touched && summary && <p data-testid="matrix-summary" className="text-[14px] font-medium text-canvas-text">{summary}</p>}
      {touched && resolved && !allFailed && (
        <div className="max-w-full overflow-x-auto rounded-[10px]">
          <table className="w-full min-w-max border-collapse text-left text-[13px] text-canvas-text">
            <caption className="sr-only">{MATRIX_TITLE}</caption>
            <thead>
              <tr>
                <th scope="col" className={`${th} sticky left-0 z-10 bg-paper font-mono text-[11px] uppercase tracking-[0.06em] text-canvas-muted`}>City</th>
                <th scope="col" className={`${th} font-mono text-[11px] uppercase tracking-[0.06em] text-canvas-muted`}>All fans</th>
                {matrix.columns.map((b) => (
                  <th key={b} scope="col" className={th}>
                    <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-canvas-text">{BAND_LABEL[b]}</span>
                    <span className="block text-[11px] font-normal text-canvas-muted">{indexRangeText(matrix.ranges[b]!.min, matrix.ranges[b]!.max)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r, i) => (
                <MatrixRowView key={r.cityId} row={r} columns={matrix.columns} request={requests[i]!} onOpen={(band, el) => { trigger.current = el; setOpen({ cityId: r.cityId, band }); }} openBand={open?.cityId === r.cityId ? open.band : null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && cellOf && openCity && (
        <div ref={popRef} tabIndex={-1} role="dialog" aria-label={`${openCity.name}, ages ${BAND_LABEL[open.band]}`} onKeyDown={(e) => { if (e.key === "Escape") close(); }} className="flex max-w-md flex-col gap-2 rounded-[10px] border border-canvas-line bg-paper-raised p-3 focus-visible:outline-2 focus-visible:outline-gold">
          <p className="text-[13px] font-semibold text-canvas-text">{openCity.name} · fans aged {BAND_LABEL[open.band]}</p>
          <ol className="flex list-none flex-col gap-1 p-0 text-[13px] text-canvas-text">
            {cellOf.top5.map((it, i) => <li key={`${it.entityId}-${i}`} className="flex justify-between gap-3"><span className="min-w-0 truncate">{it.name}</span><span className="shrink-0 text-canvas-muted tabular">Fans #{it.artistRank}{it.cityRank !== null && cellOf.top5.some((t) => t.cityRank !== null) ? ` · city #${it.cityRank}` : ""}</span></li>)}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            {hrefFor(open.cityId, open.band) && <Link to={hrefFor(open.cityId, open.band)!} className={btn}>Open the {openCity.name} playbook</Link>}
            <button type="button" onClick={close} className={btn}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

function MatrixRowView({ row, columns, request, onOpen, openBand }: { row: MatrixRow; columns: AgeBand[]; request: SegmentRequest; onOpen: (band: AgeBand, el: HTMLElement) => void; openBand: AgeBand | null }) {
  const span = Math.max(columns.length, 1);
  return (
    <tr data-testid="matrix-row">
      <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-canvas-line bg-paper px-2 py-2 font-semibold">{row.name}</th>
      <td className="min-w-[9rem] border-b border-canvas-line px-2 py-2 align-top">
        {row.allFansTop ? <><span className="block">{row.allFansTop.brand}</span><span className="block text-[12px] text-canvas-muted">Fans rank it #{row.allFansTop.fanRank}</span></> : <span className="text-canvas-muted">Not in memory</span>}
      </td>
      {row.state === "ok" ? columns.map((b) => <td key={b} className="min-w-[10rem] border-b border-canvas-line px-1 py-1 align-top">{row.cells[b] ? <CellButton cell={row.cells[b]!} open={openBand === b} onOpen={onOpen} /> : <span className="px-2 text-canvas-muted" aria-label="No data for this age group">·</span>}</td>) : (
        <td colSpan={span} className="border-b border-canvas-line px-2 py-2 text-canvas-muted">
          {row.state === "loading" ? <span role="status">Loading…</span>
            : row.state === "no_skew" ? "No age group stands out"
            : row.state === "idle" ? "Not loaded yet"
            : <span className="inline-flex flex-wrap items-center gap-2">Couldn't load <button type="button" aria-label={`Retry ${row.name}`} onClick={() => void loadSegments(request)} className={btn}>Retry</button></span>}
        </td>
      )}
    </tr>
  );
}

function CellButton({ cell, open, onOpen }: { cell: MatrixCell; open: boolean; onOpen: (band: AgeBand, el: HTMLElement) => void }) {
  if (!cell.brand) return <span className="px-2 text-canvas-muted">No brands</span>;
  return (
    <button type="button" aria-expanded={open} aria-haspopup="dialog" onClick={(e) => onOpen(cell.band, e.currentTarget)} className="flex min-h-11 w-full flex-col items-start gap-0.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
      <span className="font-medium">{cell.brand}</span>
      <span className="text-[12px] text-canvas-muted">Fans rank it #{cell.fanRank}</span>
      {cell.offCityTop20 && <span className="text-[11px] text-canvas-muted">not in city top 20</span>}
      {cell.unique === true && <span className="rounded-full bg-bone px-2 text-[11px] font-semibold text-canvas">unique</span>}
    </button>
  );
}
