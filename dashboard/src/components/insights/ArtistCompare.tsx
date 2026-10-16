import { useEffect, useRef, useState } from "react";
import { extractOverlap } from "@/lib/qloo/adapters";
import { callQlooTool } from "@/lib/qloo/client";

type Result = { name: string; overlap: number | null; error?: string };

const pct = (v: number) => (v >= 0 && v <= 1 ? `${Math.round(v * 100)}%` : v > 1 && v <= 100 ? `${Math.round(v)}%` : null);

export function ArtistCompare({ artist, source }: { artist: { entityId: string; name: string }; source: "live" | "sample" | string }) {
  const sample = source === "sample";
  const [names, setNames] = useState(["", ""]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const targets = names.map((n) => n.trim()).filter(Boolean);

  const compare = async () => {
    if (sample || targets.length === 0) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setResults([]);
    const out: Result[] = [];
    for (const name of targets) {
      try {
        const { envelope } = await callQlooTool("qloo_compare_audiences", { group_a: [artist.entityId], group_b: [name] }, { signal: c.signal });
        out.push({ name, overlap: extractOverlap(envelope) });
      } catch (e) {
        if (c.signal.aborted) return;
        out.push({ name, overlap: null, error: e instanceof Error ? e.message : "Comparison failed" });
      }
      setResults([...out]);
    }
    setBusy(false);
  };

  return (
    <section aria-label="Artist compare" className="flex min-w-0 flex-col gap-3 rounded-[14px] bg-paper p-3 lg:p-4">
      <h2 className="font-title text-[20px] leading-tight text-canvas-text">Compare with another artist</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        {[0, 1].map((i) => (
          <input key={i} aria-label={`Comparison artist ${i + 1}`} value={names[i]} disabled={sample} placeholder={`Artist ${i + 1}`} maxLength={80}
            onChange={(e) => setNames((p) => p.map((n, j) => (j === i ? e.target.value : n)))}
            className="h-12 min-w-0 flex-1 rounded-[10px] bg-canvas px-3 text-[15px] text-canvas-text placeholder:text-canvas-muted focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50" />
        ))}
        <button type="button" onClick={() => void compare()} disabled={sample || busy || targets.length === 0} className="inline-flex h-12 items-center justify-center rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50">Compare</button>
      </div>
      <p className="text-[12px] text-canvas-muted">{sample ? "Live comparisons need a live run" : "Each comparison uses 1 Qloo call"}</p>
      {sample && <p className="sr-only">Each comparison uses 1 Qloo call</p>}
      {results.length > 0 && (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {results.map((r) => {
            const shown = r.overlap !== null ? pct(r.overlap) : null;
            return (
              <li key={r.name} className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 text-[14px]">
                <span className="text-canvas-text">{artist.name} vs {r.name}</span>
                {r.error ? <span role="alert" className="text-state-error">{r.error}</span>
                  : shown ? <span className="font-mono tabular text-canvas-text">{shown}</span>
                  : <span className="text-canvas-muted">Overlap unavailable</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
