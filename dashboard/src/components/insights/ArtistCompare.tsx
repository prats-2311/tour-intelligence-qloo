import { useEffect, useRef, useState } from "react";
import { fit } from "@/components/playbook/format";
import { envelopeError, extractSharedTaste } from "@/lib/qloo/adapters";
import { callQlooTool } from "@/lib/qloo/client";

type Candidate = { id: string; name: string; description?: string; type?: string };
type Result = { id: number; name: string; sharedTaste: number | null; tags: string[]; error?: string; note?: string; candidates?: Candidate[]; cached?: boolean; stale?: boolean };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const short = (d: string) => (d.length > 90 ? `${d.slice(0, 87).trimEnd()}…` : d);

/** Candidates for the unresolved group_b input (the typed name). The artist itself is always sent as an entity id. */
function candidatesOf(envelope: unknown): Candidate[] {
  const issues = isRec(envelope) && isRec(envelope.resolution) && Array.isArray(envelope.resolution.issues) ? envelope.resolution.issues : [];
  return issues.flatMap((i) => (isRec(i) && i.field === "group_b" && Array.isArray(i.candidates) ? i.candidates : [])).flatMap((c) =>
    isRec(c) && typeof c.id === "string" && c.id !== "" && typeof c.name === "string"
      ? [{ id: c.id, name: c.name, ...(typeof c.description === "string" && c.description ? { description: short(c.description) } : {}), ...(typeof c.type === "string" ? { type: c.type.replace("urn:entity:", "") } : {}) }]
      : []);
}

/** Only an ok/empty envelope can mean "not enough shared taste"; every other status says what Qloo said. */
function outcomeOf(envelope: unknown): Pick<Result, "error" | "note" | "candidates"> {
  const error = envelopeError(envelope);
  if (error) return { error };
  const status = isRec(envelope) ? envelope.status : undefined;
  if (status === "ok" || status === "empty" || status === undefined) return {};
  const summary = isRec(envelope) && typeof envelope.summary === "string" && envelope.summary ? envelope.summary : `Qloo returned ${String(status)} for this comparison`;
  return { note: summary, ...(status === "needs_input" ? { candidates: candidatesOf(envelope) } : {}) };
}

export function ArtistCompare({ artist, source }: { artist: { entityId: string; name: string }; source: "live" | "sample" | string }) {
  const sample = source === "sample";
  const [names, setNames] = useState(["", ""]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  useEffect(() => () => ctl.current?.abort(), []);
  const targets = names.map((n) => n.trim()).filter(Boolean);

  const run = async (id: number, name: string, groupB: string, signal: AbortSignal): Promise<Result | null> => {
    try {
      const { envelope, cached, stale } = await callQlooTool("qloo_compare_audiences", { group_a: [artist.entityId], group_b: [groupB] }, { signal });
      const shared = extractSharedTaste(envelope);
      return { id, name, sharedTaste: shared.value, tags: shared.tags, ...outcomeOf(envelope), cached, stale };
    } catch (e) {
      if (signal.aborted) return null;
      return { id, name, sharedTaste: null, tags: [], error: e instanceof Error ? e.message : "Comparison failed" };
    }
  };

  const compare = async () => {
    if (sample || targets.length === 0) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setResults([]);
    const out: Result[] = [];
    for (const name of targets) {
      const r = await run(++nextId.current, name, name, c.signal);
      if (!r) return;
      out.push(r);
      setResults([...out]);
    }
    setBusy(false);
  };

  /** One re-call per pick, with the chosen entity id in place of the typed name. */
  const pick = async (row: Result, candidate: Candidate) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    const r = await run(row.id, row.name, candidate.id, c.signal);
    if (!r) return;
    setResults((prev) => prev.map((x) => (x.id === row.id ? { ...r, name: candidate.name } : x)));
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
            return (
              <li key={r.id} className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 text-[14px]">
                <span className="text-canvas-text">{artist.name} vs {r.name}{r.cached && <span className="ml-2 text-[12px] text-canvas-muted">From cache</span>}{r.stale && <span className="ml-2 text-[12px] text-state-stale">Stale</span>}</span>
                {r.error ? <span role="alert" className="text-state-error">{r.error}</span>
                  : r.note ? <span className="text-canvas-muted">{r.note}</span>
                  : r.sharedTaste !== null ? <span className="text-right"><span className="font-mono tabular text-canvas-text">{fit(r.sharedTaste)}</span><span className="block text-[12px] text-canvas-muted">shared taste{r.tags.length > 0 ? ` · ${r.tags.join(", ")}` : ""}</span></span>
                  : <span className="text-canvas-muted">Not enough shared taste data</span>}
                {r.candidates && r.candidates.length > 0 && (
                  <div className="basis-full" role="group" aria-label={`Did you mean… ${r.name}`}>
                    <p className="text-[13px] text-canvas-muted">Did you mean…?</p>
                    <ul className="flex flex-col">
                      {r.candidates.slice(0, 5).map((cand) => (
                        <li key={cand.id}>
                          <button type="button" disabled={busy} onClick={() => void pick(r, cand)} className="flex min-h-11 w-full flex-col items-start justify-center rounded-[8px] px-2 text-left hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50">
                            <span className="text-[14px] text-canvas-text">{cand.name}{cand.type ? <span className="ml-2 text-[12px] text-canvas-muted">{cand.type}</span> : null}</span>
                            {cand.description && <span className="text-[12px] text-canvas-muted">{cand.description}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
