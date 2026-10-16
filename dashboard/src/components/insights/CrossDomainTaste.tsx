import { useCallback, useEffect, useRef, useState } from "react";
import { CROSS_CATEGORIES, playbookCrossDomain, type CrossCategory } from "@/lib/qloo/adapters";
import { streamCityPlaybook } from "@/lib/qloo/client";
import type { PlaybookCard, ScoredCity } from "@/lib/qloo/types";

type Items = ReturnType<typeof playbookCrossDomain>;
type Load = { status: "idle" } | { status: "loading" } | { status: "done"; items: Items } | { status: "error"; message: string };
const LABELS: Record<CrossCategory, string> = { artist: "Artists", movie: "Movies", tv_show: "TV shows", place: "Places", brand: "Brands" };

/** Streams one city playbook; aborts on unmount, city change and re-run so no stream leaks. */
export function useCityPlaybook(artist: { entityId: string; name: string }, city: ScoredCity) {
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setLoad({ status: "idle" }); return () => ctl.current?.abort(); }, [city.id, artist.entityId]);
  const run = useCallback(async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setLoad({ status: "loading" });
    let cards: PlaybookCard[] | null = null;
    let err: string | null = null;
    try {
      for await (const e of streamCityPlaybook({ artist: artist.name, artistEntityId: artist.entityId, city: city.name, country: city.country }, { signal: c.signal })) {
        if (e.type === "playbook") cards = e.playbook.cards;
        else if (e.type === "error") err = e.message;
      }
    } catch (e) {
      if (c.signal.aborted) return;
      err = e instanceof Error ? e.message : "Taste lookup failed";
    }
    if (c.signal.aborted) return;
    setLoad(cards ? { status: "done", items: playbookCrossDomain(cards) } : { status: "error", message: err ?? "Qloo returned no taste data for this city" });
  }, [artist.entityId, artist.name, city.name, city.country]);
  return { load, run };
}

export function CrossDomainTaste({ artist, city, source }: { artist: { entityId: string; name: string }; city: ScoredCity; source: "live" | "sample" | string }) {
  const sample = source === "sample";
  const { load, run } = useCityPlaybook(artist, city);
  const [filter, setFilter] = useState<CrossCategory | "all">("all");
  const items = load.status === "done" ? load.items : [];
  const cats = CROSS_CATEGORIES.filter((c) => items.some((i) => i.category === c));
  const shown = filter === "all" ? cats : cats.filter((c) => c === filter);
  const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
  return (
    <section aria-label="Cross-domain taste" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Cross-domain taste · {city.name}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={sample || load.status === "loading"} onClick={() => { if (!sample) void run(); }} className={`${btn} bg-paper-raised text-canvas-text hover:bg-[#3a3932] disabled:opacity-50`}>Load taste for {city.name}</button>
        {sample && <p className="text-[13px] text-canvas-muted">Live taste lookups need a live run</p>}
        {load.status === "loading" && <p role="status" className="text-[13px] text-canvas-muted">Loading taste…</p>}
      </div>
      {load.status === "error" && <p role="alert" className="text-[14px] text-state-error">{load.message}</p>}
      {load.status === "done" && (items.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">Qloo returned no cross-domain taste for {city.name}</p>
      ) : (
        <>
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
            {(["all", ...cats] as const).map((c) => (
              <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)} className={`${btn} ${filter === c ? "bg-bone text-canvas" : "bg-paper-raised text-canvas-text"}`}>{c === "all" ? "All" : LABELS[c]}</button>
            ))}
          </div>
          {shown.map((c) => (
            <div key={c}>
              <h3 className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-canvas-muted">{LABELS[c]}</h3>
              <ul className="flex flex-col">
                {items.filter((i) => i.category === c).slice(0, 5).map((i) => (
                  <li key={i.name} className="flex min-h-9 items-center justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate text-canvas-text">{i.name}</span>
                    {i.affinity !== null && <span className="font-mono tabular text-canvas-muted">{Math.round(i.affinity * 100)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ))}
    </section>
  );
}
