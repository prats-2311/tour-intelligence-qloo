import { Check, CircleAlert, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { parsePastedCities, ROUTING_CAP_NOTE, routingLabel } from "@/lib/qloo/routing";
import type { TourBrief } from "@/lib/qloo/types";

const PRESETS = ["Mexico", "Brazil", "United States", "Colombia", "Argentina", "United Kingdom", "Spain", "Japan", "India"];
const DEFAULT_REGIONS = ["Mexico", "Brazil", "United States"];
const MAX_REGIONS = 6;
const MAX_WINDOW_DAYS = 62; // the gateway rejects longer This week windows
const field = "h-12 w-full min-w-0 rounded-[10px] bg-paper-raised px-3 text-[15px] text-canvas-text placeholder:text-canvas-muted lg:h-10";

export function BriefForm({ onSubmit, defaultBrief }: { onSubmit: (brief: TourBrief) => void; defaultBrief?: TourBrief }) {
  const ids = { paste: useId(), pasteHint: useId(), artist: useId(), stops: useId(), region: useId(), err: useId(), wStart: useId(), wEnd: useId(), wErr: useId() };
  const [artist, setArtist] = useState(defaultBrief?.artist ?? "");
  const [regions, setRegions] = useState<string[]>(defaultBrief?.regions ?? DEFAULT_REGIONS);
  const [custom, setCustom] = useState<string[]>(() => (defaultBrief?.regions ?? []).filter((r) => !PRESETS.includes(r)));
  const [draft, setDraft] = useState("");
  const [stops, setStops] = useState(String(defaultBrief?.maxStops ?? 6));
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState(() => (defaultBrief?.cities ?? []).map(routingLabel).join("\n"));
  const [winStart, setWinStart] = useState(defaultBrief?.dateWindow?.start ?? "");
  const [winEnd, setWinEnd] = useState(defaultBrief?.dateWindow?.end ?? "");
  const [winError, setWinError] = useState<string | null>(null);

  const routing = parsePastedCities(pasted);
  const chips = [...PRESETS, ...custom];
  const has = (r: string) => regions.some((x) => x.toLowerCase() === r.toLowerCase());
  const toggle = (r: string) => {
    setError(null);
    if (has(r)) return setRegions(regions.filter((x) => x.toLowerCase() !== r.toLowerCase()));
    if (regions.length >= MAX_REGIONS) return setError(`Pick up to ${MAX_REGIONS} regions.`);
    setRegions([...regions, r]);
  };
  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    const existing = chips.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!existing) setCustom([...custom, name]);
    if (!has(name)) {
      if (regions.length >= MAX_REGIONS) return setError(`Pick up to ${MAX_REGIONS} regions.`);
      setRegions([...regions, existing ?? name]);
    }
    setDraft("");
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = artist.trim();
    const n = Number(stops);
    if (!name) return setError("Enter an artist.");
    if (regions.length < 1 && routing.cities.length === 0) return setError("Pick at least one region.");
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError("Max stops must be a whole number from 1 to 20.");
    if ((winStart === "") !== (winEnd === "")) return setWinError("Add both dates or neither");
    if (winStart && winEnd && winEnd < winStart) return setWinError("Window end must be on or after the start");
    if (winStart && winEnd && (Date.parse(winEnd) - Date.parse(winStart)) / 86_400_000 > MAX_WINDOW_DAYS) return setWinError(`Date window can be at most ${MAX_WINDOW_DAYS} days`);
    setError(null);
    setWinError(null);
    onSubmit({ ...(defaultBrief?.artistEntityId && name === defaultBrief.artist ? { artistEntityId: defaultBrief.artistEntityId } : {}), artist: name, regions: routing.cities.length > 0 ? [] : regions, maxStops: n, ...(routing.cities.length > 0 ? { cities: routing.cities } : {}), ...(winStart && winEnd ? { dateWindow: { start: winStart, end: winEnd } } : {}) });
  };

  return (
    <form onSubmit={submit} noValidate aria-describedby={error ? ids.err : undefined} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <h1 className="font-title text-[28px] leading-tight text-canvas-text">Plan a tour</h1>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.artist} className="text-[13px] font-medium text-canvas-muted">Artist</label>
        <input id={ids.artist} value={artist} onChange={(e) => setArtist(e.target.value)} autoComplete="off" placeholder="Artist name" className={field} />
      </div>
      <fieldset disabled={routing.cities.length > 0} className="flex min-w-0 flex-col gap-2 disabled:opacity-50">
        <legend className="mb-1.5 text-[13px] font-medium text-canvas-muted">Regions ({regions.length} of {MAX_REGIONS})</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((r) => {
            const on = has(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(r)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${on ? "bg-paper-raised text-canvas-text" : "bg-canvas-raised text-canvas-muted"}`}
              >
                {on && <Check size={14} aria-hidden />}{r}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor={ids.region} className="sr-only">Add a region</label>
          <input
            id={ids.region}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Add a region"
            className={field}
          />
          <button type="button" onClick={addCustom} className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-[10px] bg-paper-raised px-4 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] lg:h-10">
            <Plus size={16} aria-hidden />Add
          </button>
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.paste} className="text-[13px] font-medium text-canvas-muted">Paste your cities</label>
        <textarea
          id={ids.paste}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={ids.pasteHint}
          placeholder={"Portland, US\nMexico City, MX"}
          className="min-h-24 w-full min-w-0 rounded-[10px] bg-paper-raised px-3 py-3 text-[15px] text-canvas-text placeholder:text-canvas-muted"
        />
        <p id={ids.pasteHint} className="text-[12px] text-canvas-muted">
          Optional. One city per line: &ldquo;City&rdquo; or &ldquo;City, Country&rdquo;. Only these cities are scored, and the regions above are not used. Add a country if a city name exists in more than one country.
        </p>
        {routing.capped && <p role="status" className="text-[13px] text-canvas-text">{ROUTING_CAP_NOTE}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.stops} className="text-[13px] font-medium text-canvas-muted">Max stops</label>
        <input id={ids.stops} type="number" inputMode="numeric" min={1} max={20} value={stops} onChange={(e) => setStops(e.target.value)} className={`${field} sm:max-w-32`} />
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={winError ? ids.wErr : undefined}>
        <legend className="mb-1.5 text-[13px] font-medium text-canvas-muted">Date window (optional)</legend>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={ids.wStart} className="text-[13px] font-medium text-canvas-muted">Window start</label>
            <input id={ids.wStart} type="date" value={winStart} onChange={(e) => { setWinStart(e.target.value); setWinError(null); }} className={field} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={ids.wEnd} className="text-[13px] font-medium text-canvas-muted">Window end</label>
            <input id={ids.wEnd} type="date" value={winEnd} onChange={(e) => { setWinEnd(e.target.value); setWinError(null); }} className={field} />
          </div>
        </div>
        {winError && (
          <p id={ids.wErr} role="alert" className="flex items-center gap-2 text-[13px] text-state-error">
            <CircleAlert size={14} aria-hidden />{winError}
          </p>
        )}
      </fieldset>
      {error && (
        <p id={ids.err} role="alert" className="flex items-center gap-2 text-[13px] text-state-error">
          <CircleAlert size={14} aria-hidden />{error}
        </p>
      )}
      <button type="submit" className="btn-gold h-12 rounded-[10px] px-5 text-[15px] font-semibold lg:h-10">Score markets</button>
    </form>
  );
}
