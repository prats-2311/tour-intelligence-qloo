import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteTour, hasOwnerToken, listTours, patchTour, savedToursAvailable, ToursError, type TourListItem, type TourStatus } from "@/lib/tours/api";
import { relativeTime } from "@/lib/tours/relativeTime";

type Filter = "all" | TourStatus;
const FILTERS: Array<{ id: Filter; label: string }> = [{ id: "all", label: "All" }, { id: "draft", label: "Drafts" }, { id: "final", label: "Final" }];
const SEARCH_DEBOUNCE_MS = 250;
const MAX_CHIPS = 4;

const btn = "inline-flex min-h-11 items-center justify-center rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const dangerBtn = "inline-flex min-h-11 items-center justify-center rounded-[8px] border border-state-error px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function Row({ tour, onStatus, onDeleted, onError }: { tour: TourListItem; onStatus: (id: string, s: TourStatus) => void; onDeleted: (id: string) => void; onError: (m: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const next: TourStatus = tour.status === "final" ? "draft" : "final";
  const failure = (e: unknown) => onError(e instanceof ToursError && e.kind === "not_found" ? e.message : "Saved tours are unavailable right now. Try again in a moment.");
  useEffect(() => { if (confirming) yesRef.current?.focus(); }, [confirming]);
  const mark = async () => {
    setBusy(true);
    try { await patchTour(tour.id, { status: next }); onStatus(tour.id, next); } catch (e) { failure(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deleteTour(tour.id); onDeleted(tour.id); } catch (e) { if (e instanceof ToursError && e.kind === "not_found") onDeleted(tour.id); else { failure(e); setConfirming(false); setTimeout(() => askRef.current?.focus(), 0); } } finally { setBusy(false); }
  };
  const shown = tour.cities.slice(0, MAX_CHIPS);
  return (
    <li data-testid="saved-tour" className="flex flex-col gap-3 rounded-[14px] border border-canvas-line bg-canvas-raised/40 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 min-w-0 break-words font-title text-[18px] leading-tight text-canvas-text">{tour.title}</h2>
          <span data-testid="tour-status" className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${tour.status === "final" ? "bg-gold text-canvas" : "bg-paper-raised text-canvas-text"}`}>{tour.status === "final" ? "Final" : "Draft"}</span>
        </div>
        <p className="m-0 text-[13px] text-canvas-muted">{tour.artist}</p>
        {shown.length > 0 && (
          <ul aria-label="Cities" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {shown.map((c) => <li key={c.id} className="rounded-full bg-paper-raised px-2 py-0.5 text-[12px] text-canvas-text">{c.name}</li>)}
            {tour.cities.length > MAX_CHIPS && <li className="rounded-full px-2 py-0.5 text-[12px] text-canvas-muted">{`+${tour.cities.length - MAX_CHIPS}`}</li>}
          </ul>
        )}
        <p className="m-0 text-[12px] text-canvas-muted">{`Updated ${relativeTime(tour.updatedAt)}`}</p>
      </div>
      {confirming ? (
        <div role="group" aria-label={`Delete ${tour.title}`} className="flex flex-col gap-2 sm:items-end">
          <p className="m-0 text-[13px] text-canvas-text">Delete this tour? This can't be undone.</p>
          <div className="flex gap-2">
            <button ref={yesRef} type="button" disabled={busy} onClick={() => void remove()} className={dangerBtn}>Yes, delete</button>
            <button type="button" disabled={busy} onClick={() => { setConfirming(false); setTimeout(() => askRef.current?.focus(), 0); }} className={btn}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link to={`/tours/board?saved=${encodeURIComponent(tour.id)}`} aria-label={`Open ${tour.title}`} className={btn}>Open</Link>
          <button type="button" disabled={busy} aria-label={`Mark ${tour.title} as ${next}`} onClick={() => void mark()} className={btn}>{next === "final" ? "Mark final" : "Mark draft"}</button>
          <button ref={askRef} type="button" disabled={busy} aria-label={`Delete ${tour.title}`} onClick={() => setConfirming(true)} className={dangerBtn}>Delete</button>
        </div>
      )}
    </li>
  );
}

/** Saved tours of this browser: search, filter, open, mark final or draft, delete. */
export default function MyTours() {
  const searchId = useId();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tours, setTours] = useState<TourListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disabled] = useState(() => !savedToursAvailable());
  const [reload, setReload] = useState(0);
  const filtered = q.trim() !== "" || filter !== "all";

  useEffect(() => { document.title = "My tours"; }, []);
  useEffect(() => {
    const t = setTimeout(() => setQ(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (disabled) return;
    if (!hasOwnerToken()) { setTours([]); return; } // nothing has been saved from this browser yet
    const ctl = new AbortController();
    setError(null);
    listTours({ q, status: filter }, { signal: ctl.signal })
      .then((r) => { if (!ctl.signal.aborted) setTours(r); })
      .catch((e: unknown) => { if (!ctl.signal.aborted) { setTours((cur) => cur ?? []); setError(e instanceof ToursError && e.kind === "disabled" ? e.message : "Couldn't load your saved tours."); } });
    return () => ctl.abort();
  }, [q, filter, reload, disabled]);

  const onStatus = useCallback((id: string, status: TourStatus) => setTours((cur) => (cur ?? []).map((t) => (t.id === id ? { ...t, status, updatedAt: Date.now() } : t)).filter((t) => filter === "all" || t.status === filter)), [filter]);
  const onDeleted = useCallback((id: string) => setTours((cur) => (cur ?? []).filter((t) => t.id !== id)), []);
  const loading = !disabled && tours === null && !error;
  const count = tours?.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-2">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-title text-[26px] leading-tight text-canvas-text">My tours</h1>
        <p className="m-0 text-[13px] text-canvas-muted">Saved in this browser's private space. Clearing site data removes access.</p>
      </header>

      {disabled ? (
        <p role="note" className="m-0 rounded-[10px] border border-canvas-line p-3 text-[13px] text-canvas-text">Saved tours need this browser to keep site data. Allow site data (or leave private browsing) and plan a tour again to save it.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={searchId} className="text-[12px] text-canvas-muted">Search saved tours</label>
              <input id={searchId} type="search" role="searchbox" aria-label="Search saved tours" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Artist, city or title" className="h-12 w-full min-w-0 rounded-[10px] bg-paper-raised px-3 text-[15px] text-canvas-text placeholder:text-canvas-muted lg:h-10" />
            </div>
            <div role="radiogroup" aria-label="Status" className="flex gap-1">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)} className={`inline-flex min-h-11 items-center rounded-[8px] px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${filter === f.id ? "bg-gold text-canvas" : "bg-paper-raised text-canvas-text hover:bg-[#3a3932]"}`}>{f.label}</button>
              ))}
            </div>
          </div>

          <p role="status" className="m-0 text-[13px] text-canvas-muted">{loading ? "Loading your tours" : error && tours?.length === 0 ? "" : `${count} saved ${count === 1 ? "tour" : "tours"}`}</p>
          {actionError && <p role="alert" className="m-0 rounded-[10px] border border-state-error p-3 text-[13px] text-canvas-text">{actionError}</p>}

          {error && (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-[10px] border border-state-error p-3 text-[13px] text-canvas-text">
              <p className="m-0">{error}</p>
              <button type="button" onClick={() => setReload((n) => n + 1)} className={btn}>Try again</button>
            </div>
          )}

          {!error && tours !== null && tours.length === 0 && (
            filtered ? (
              <p className="m-0 text-[14px] text-canvas-muted">No saved tours match that search.</p>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-canvas-line p-5">
                <p className="m-0 text-[14px] text-canvas-text">No saved tours yet. Plan a tour and it's saved here automatically.</p>
                <Link to="/tours/board?new=1" className="btn-gold inline-flex h-12 items-center rounded-[10px] px-5 text-[15px] font-semibold lg:h-10">Plan a tour</Link>
              </div>
            )
          )}

          {tours !== null && tours.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {tours.map((t) => <Row key={t.id} tour={t} onStatus={onStatus} onDeleted={onDeleted} onError={setActionError} />)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
