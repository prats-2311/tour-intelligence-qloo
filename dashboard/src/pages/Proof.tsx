import type { ReactNode } from "react";
import { useId } from "react";
import { BACKTEST, METHODS, METHOD_LABEL, hitLine, rankText, type Backtest, type BacktestRun, type CaseResult, type MethodResult } from "@/lib/qloo/backtest";

const TITLE = "Would it have found what the real tour used?";
const REASON = "Run 1 asked Qloo for artists the headliner's fans like in that city, which returns global taste neighbours, not local acts. We changed the recipe to rank the city's own popular artists by taste fit, then tested it on new cases reviewed after the change.";
const eyebrow = "font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted";
const runDate = (r: BacktestRun) => (Number.isNaN(Date.parse(r.runAt)) ? r.runAt : new Date(r.runAt).toISOString().slice(0, 10));
const hostname = (u: string): string => { try { return new URL(u).hostname; } catch { return u; } };

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">{children}</h2>;
}

function RankCell({ r }: { r: MethodResult }) {
  return (
    <dd className="m-0 flex flex-wrap items-baseline justify-end gap-x-2 text-right font-mono text-[13px] tabular text-canvas-text">
      <span>{rankText(r)}</span>
      {r.status === "ok" && r.note === "rank_unavailable" && <span className="font-sans text-[12px] text-canvas-muted">taste ranking unavailable</span>}
    </dd>
  );
}

function CaseCard({ c }: { c: CaseResult }) {
  return (
    <article aria-label={`${c.realEntity.name}, ${c.artist} in ${c.city}`} className="flex min-w-0 flex-col gap-3 rounded-[18px] bg-paper p-4">
      <p className={eyebrow}>{c.decision}</p>
      <div className="min-w-0">
        <p className="text-[13px] text-canvas-muted">{c.artist} · {c.city}</p>
        <h3 className="mt-1 break-words text-[17px] font-semibold leading-snug text-canvas-text">{c.realEntity.name}</h3>
        {!c.realEntity.resolved && <p className="mt-1 text-[12px] text-canvas-muted">Not found in Qloo search — matched by name</p>}
      </div>
      <dl className="m-0 grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5">
        {METHODS.map((m) => (
          <div key={m} className="col-span-2 grid grid-cols-subgrid items-baseline">
            <dt className="min-w-0 text-[13px] text-canvas-muted">{METHOD_LABEL[m]}</dt>
            <RankCell r={c.results[m]} />
          </div>
        ))}
      </dl>
      <p className="text-[14px] leading-[1.45] text-canvas-text">{c.summary}</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0">
        {c.sources.map((u) => (
          <li key={u} className="min-w-0">
            <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center break-all text-[13px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{hostname(u)}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Boxscore({ run, suffix = "" }: { run: BacktestRun; suffix?: string }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="boxscore">
      {METHODS.map((m) => {
        const mine = m === "qloo_playbook";
        return (
          <section key={m} aria-label={METHOD_LABEL[m] + suffix} className={`min-w-0 rounded-[18px] bg-paper p-4 ${mine ? "border-t-2 border-gold" : ""}`}>
            <h3 className={`${eyebrow} ${mine ? "!text-gold" : ""}`}>{METHOD_LABEL[m]}</h3>
            <p className="mt-2 break-words font-mono text-[18px] font-bold leading-snug text-canvas-text tabular lg:text-[20px]">{hitLine(run.summary[m], 10)}</p>
            <p className="mt-1 break-words font-mono text-[13px] text-canvas-muted tabular">{hitLine(run.summary[m], 20)}</p>
          </section>
        );
      })}
    </div>
  );
}

function Lost({ run, label }: { run: BacktestRun; label: string }) {
  const id = useId();
  const lost = run.lost.map((x) => run.cases.find((c) => c.id === x)).filter((c): c is CaseResult => !!c);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Heading id={id}>{label}</Heading>
      {lost.length === 0
        ? <p className="text-[15px] text-canvas-text">No case where a baseline ranked the real entity above the playbook.</p>
        : <div className="grid gap-3 lg:grid-cols-2">{lost.map((c) => <CaseCard key={c.id} c={c} />)}</div>}
    </section>
  );
}

function Note({ run }: { run: BacktestRun }) {
  return run.methodNote ? <p className="max-w-[68ch] text-[14px] leading-[1.45] text-canvas-muted">{run.methodNote}</p> : null;
}

function HowWeGotHere({ run }: { run: BacktestRun }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Heading id={id}>How we got here</Heading>
      <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">{REASON}</p>
      <p className={eyebrow}>Run 1 · {runDate(run)}</p>
      <Note run={run} />
      <Boxscore run={run} suffix=" (run 1)" />
      <Lost run={run} label="Where we lost in run 1" />
    </section>
  );
}

function Limitations({ n }: { n: number }) {
  const id = useId();
  const items = [
    "Qloo's graph and the LLM's training data may already reflect these past activations (post-hoc leakage). We cannot control for this.",
    "This shows consistency with real decisions, not causal lift.",
    `Small sample: ${n} cases, each human-reviewed against its sources.`,
    "The playbook column is the exact Qloo request the City Playbook makes, with the list widened to 20.",
    "The generic LLM had no web search.",
  ];
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <Heading id={id}>Limitations</Heading>
      <ul className="m-0 flex max-w-[68ch] list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.5] text-canvas-text">
        {items.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  );
}

export function ProofView({ data }: { data: Backtest }) {
  const everyId = useId();
  const header = (
    <header className="flex flex-col gap-3">
      <p className={eyebrow}>PROOF · ACTIVATION BACKTEST</p>
      <h1 className="font-title text-[32px] leading-[1.1] text-bone [text-wrap:balance] lg:text-[48px]">{TITLE}</h1>
    </header>
  );
  if (data.status === "pending") {
    return (
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 pb-8">
        {header}
        <p className="text-[16px] text-canvas-muted">The backtest has not been published yet.</p>
      </div>
    );
  }
  const run = data.runs[data.runs.length - 1]!;
  const first = data.runs[0]!;
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 pb-8">
      <div className="flex flex-col gap-4">
        {header}
        <p className="max-w-[68ch] text-[16px] leading-[1.5] text-canvas-text">
          We took {run.n} real city activations from 2021–2026 tours (a sponsor, a merch collab or a local act) and checked whether each method put it in its top 10 for that city.
        </p>
        <Note run={run} />
      </div>
      <Boxscore run={run} />
      <Lost run={run} label="Where we lost" />
      <section aria-labelledby={everyId} className="flex flex-col gap-4">
        <Heading id={everyId}>Every case</Heading>
        <div className="grid gap-3 lg:grid-cols-2">{run.cases.map((c) => <CaseCard key={c.id} c={c} />)}</div>
      </section>
      {data.runs.length >= 2 && <HowWeGotHere run={first} />}
      <Limitations n={run.n} />
      <footer className="break-words font-mono text-[12px] text-canvas-muted">
        Run {runDate(run)} · model {run.model} · reproduce with the steps in backtest/README.md
      </footer>
    </div>
  );
}

export default function Proof() {
  return <ProofView data={BACKTEST} />;
}
