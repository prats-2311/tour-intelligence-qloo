import { useEffect, useState } from "react";
import { fit } from "@/components/playbook/format";
import { CROSS_CATEGORIES, playbookCrossDomain, type CrossCategory } from "@/lib/qloo/adapters";
import { SAMPLE_PLAYBOOK_CITY_IDS } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { loadPlaybook, playbookKey, usePlaybook, usePlaybookSnapshot, type PlaybookRequest } from "@/lib/qloo/playbookStore";
import { showcasePlaybookEvents } from "@/lib/qloo/showcase";
import type { ScoredCity } from "@/lib/qloo/types";

const LABELS: Record<CrossCategory, string> = { artist: "Artists", movie: "Movies", tv_show: "TV shows", place: "Places", brand: "Brands" };
const SAMPLE_COVERAGE = "Sample playbooks cover Mexico City, São Paulo, Guadalajara and Curitiba";

export function CrossDomainTaste({ artist, city, source }: { artist: { entityId: string; name: string }; city: ScoredCity; source: "live" | "sample" | string }) {
  const sample = source !== "live";
  const showcase = source === "showcase";
  const sampleSet = showcase ? "showcase" : undefined;
  const covered = showcase ? showcasePlaybookEvents(city.id) !== null : (SAMPLE_PLAYBOOK_CITY_IDS as readonly string[]).includes(city.id);
  const key = playbookKey(artist.entityId, city.id, sampleSet);
  // Live lookups cost Qloo calls, so they wait for a click, unless the Playbook page already loaded this one.
  const [clicked, setClicked] = useState<string | null>(null);
  const request: PlaybookRequest = { artist: artist.name, artistEntityId: artist.entityId, city: { id: city.id, name: city.name, country: city.country }, sample, sampleSet, delayMs: sample ? 10 : undefined };
  const existing = usePlaybookSnapshot(key)?.status;
  // Failed or interrupted entries never restart on their own: that would be an unasked live call.
  const enabled = sample ? covered : clicked === key || existing === "done" || existing === "streaming";
  const pb = usePlaybook(enabled ? request : null);
  const run = () => { setClicked(key); void loadPlaybook(request); };
  const items = pb.status === "done" ? playbookCrossDomain(pb.cards) : [];
  const [filter, setFilter] = useState<CrossCategory | "all">("all");
  useEffect(() => { setFilter("all"); }, [city.id]);
  const cats = CROSS_CATEGORIES.filter((c) => items.some((i) => i.category === c));
  const shown = filter === "all" ? cats : cats.filter((c) => c === filter);
  const btn = "inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
  return (
    <section aria-label="Cross-domain taste" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Cross-domain taste · {city.name}</h2>
      <div className="flex flex-wrap items-center gap-3">
        {!sample && <button type="button" disabled={pb.status === "streaming"} onClick={run} className={`${btn} bg-paper-raised text-canvas-text hover:bg-[#3a3932] disabled:opacity-50`}>Load taste for {city.name}</button>}
        {sample && !covered && <p className="text-[13px] text-canvas-muted">{showcase ? "Recorded playbooks cover only the cities the run flagged as worth a closer look" : SAMPLE_COVERAGE}</p>}
        {pb.status === "streaming" && <p role="status" className="text-[13px] text-canvas-muted">Loading taste…</p>}
      </div>
      {pb.status === "error" && <p role="alert" className="text-[14px] text-state-error">{pb.error?.message ?? "Taste lookup failed"}</p>}
      {pb.status === "interrupted" && (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-state-error">Connection lost — try again</p>
          <button type="button" onClick={run} className={`${btn} bg-paper-raised text-canvas-text hover:bg-[#3a3932]`}>Retry</button>
        </div>
      )}
      {pb.status === "done" && pb.cards.length === 0 && <p className="text-[14px] text-canvas-muted">Qloo returned no taste data for this city</p>}
      {pb.status === "done" && pb.cards.length > 0 && (items.length === 0 ? (
        <p className="text-[14px] text-canvas-muted">Qloo returned no cross-domain taste for {city.name}</p>
      ) : (
        <>
          <p className="text-[12px] text-canvas-muted">Affinity (0–1)</p>
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
                    {i.affinity !== null && <span aria-label={`affinity ${fit(i.affinity)}`} className="font-mono tabular text-canvas-muted">{fit(i.affinity)} fit</span>}
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
