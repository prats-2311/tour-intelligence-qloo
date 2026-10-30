import type { ReactNode } from "react";
import { Fragment, useId, useState } from "react";
import { Link } from "react-router-dom";
import { getBacktest, METHODS, METHOD_LABEL, hitLine, rankText, type Backtest, type BacktestRun, type CaseResult, type MethodResult, type ProofCheckers, type ProofTable, type ProofV3, type ProofV3Test } from "@/lib/qloo/backtest";

import { loadRecordings } from "@/lib/qloo/recordings";
import { isSampleMode } from "@/lib/qloo/client";
import { useStats, type TeamStats, type TrustStats } from "@/lib/qloo/stats";

/** The public repo is created later: change the URL here only. */
export const PROTOCOL_URL = "https://github.com/prats-2311/tour-intelligence-qloo/blob/master/docs/qloo/proof-v3-protocol.md";
const V3_INTRO = "We pre-registered every test before running it and publish all of it, including where Qloo-backed ranking lost.";
/** Sponsor lift first (B), then the claim checker (catch) and grounding (C); Test A, where the LLM won, and the Gemini + Qloo fusion (F), which did not beat Gemini, sit last under a Limits heading. Tests not listed come after, in file order. */
const V3_ORDER = ["B", "B_post_cutoff", "catch", "C", "A", "F"];
/** Amendment 9's Test B on cases after the model's cutoff: the id the publish step gives it (same table shape as Test B). */
export const A9_TEST_ID = "B_post_cutoff";
/** The protocol's heading anchors on GitHub. */
const AMENDMENT_9_ANCHOR = "amendment-9-test-b-on-cases-after-the-models-training-cutoff-2026-10-30-before-any-case-for-it-was-collected";
const AMENDMENT_10_ANCHOR = "amendment-10-catch-rates-for-the-products-other-checkers-2026-10-30-before-any-of-these-was-run";
/** Update by hand when the suites change (not computed at build). 30 Oct 2026: dashboard vitest 1,280 + gateway vitest 1,032 passing + Python test functions 486 (counted statically; no venv offline) = 2,798. */
export const ENGINEERING_TESTS = 2798;
export const ENGINEERING_AS_OF = "30 Oct 2026";
const TITLE = "Would it have found what the real tour used?";
const REASON = "Run 1 asked Qloo for artists the headliner's fans like in that city, which returns global taste neighbours. Run 2 ranked the city's own popular artists by taste fit and was judged on fresh cases reviewed after the change; it did no better, because Qloo's city-popularity list misses the most famous national acts.";
const WHAT = "For naming the specific famous local guest or sponsor a real tour used, a general-purpose LLM did better than Qloo's taste graph in both runs. Qloo's recommendations reflect what over-indexes with an audience in a city, not who is most famous there — that is world knowledge. So the playbook now asks an LLM for local candidates and uses Qloo to check each one exists and to rank it by taste fit. We have not yet tested that change on new cases, so we make no claim about it here.";
const TYPE_LABEL = { sponsor: "a sponsor", merch_collab: "a merch collab", local_artist: "a local act" } as const;

/** "2022–2026" from the cases' own dates (YYYY-MM). */
function yearRange(run: BacktestRun): string {
  const ys = run.cases.map((c) => Number.parseInt(c.date, 10)).filter(Number.isFinite);
  if (ys.length === 0) return "";
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
/** The activation types actually present, in a fixed order: "a sponsor, a merch collab or a local act". */
function typeList(run: BacktestRun): string {
  const present = (Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).filter((t) => run.cases.some((c) => c.activationType === t));
  if (present.length === 1 && present[0] === "local_artist") return "a local act on the bill";
  const labels = present.map((t) => TYPE_LABEL[t]);
  return labels.length < 2 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}
const LIMIT_4 = {
  v1: "The playbook column is the exact Qloo request the City Playbook makes, with the list widened to 20.",
  v2: "For local acts, the playbook column ranks the city's 10 most popular artists by taste fit (Qloo rank); for brands it is the exact recommend request the City Playbook makes, widened to 20.",
} as const;
const eyebrow = "font-mono text-[11px] uppercase tracking-[0.08em] text-canvas-muted";
const runDate = (r: BacktestRun) => (Number.isNaN(Date.parse(r.runAt)) ? r.runAt : new Date(r.runAt).toISOString().slice(0, 10));
const hostname = (u: string): string => { try { return new URL(u).hostname; } catch { return u; } };

function Heading({ id, children, as: Tag = "h2" }: { id: string; children: ReactNode; as?: "h2" | "h3" }) {
  return <Tag id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">{children}</Tag>;
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
        {c.sources.map((u, i) => (
          <li key={`${i}-${u}`} className="min-w-0">
            <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-11 items-center break-all text-[13px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{hostname(u)}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Boxscore({ run, suffix = "" }: { run: BacktestRun; suffix?: string }) {
  // Gold marks whichever method has the most top-10 hits in this run (ties share it; nobody if all are 0).
  const best = Math.max(...METHODS.map((m) => run.summary[m].hit10));
  const lead = best > 0 ? METHODS.filter((m) => run.summary[m].hit10 === best) : [];
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="boxscore">
      <h2 className="sr-only">{`Top 10 hit rates${suffix}`}</h2>
      {METHODS.map((m) => {
        const mine = lead.includes(m);
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

function Lost({ run, label, as }: { run: BacktestRun; label: string; as?: "h2" | "h3" }) {
  const id = useId();
  const lost = run.lost.map((x) => run.cases.find((c) => c.id === x)).filter((c): c is CaseResult => !!c);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Heading id={id} as={as}>{label}</Heading>
      {lost.length === 0
        ? <p className="text-[15px] text-canvas-text">No case where a baseline ranked the real entity above the playbook.</p>
        : <div className="grid gap-3 lg:grid-cols-2">{lost.map((c) => <CaseCard key={c.id} c={c} />)}</div>}
    </section>
  );
}

function WhatThisShows() {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <Heading id={id}>What this shows</Heading>
      <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">{WHAT}</p>
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
      <Lost run={run} label="Where we lost in run 1" as="h3" />
    </section>
  );
}

function Limitations({ run }: { run: BacktestRun }) {
  const id = useId();
  const n = run.n;
  const items = [
    "Qloo's graph and the LLM's training data may already reflect these past activations (post-hoc leakage). We cannot control for this.",
    "This shows consistency with real decisions, not causal lift.",
    `Small sample: ${n} cases, each human-reviewed against its sources.`,
    LIMIT_4[run.method],
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

function TableView({ t, label }: { t: ProofTable; label: string }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-[12px] bg-paper" tabIndex={0} role="group" aria-label={`${label}, scrolls sideways`}>
      <table aria-label={label} className="w-full min-w-max border-collapse text-left text-[13px] text-canvas-text">
        <thead>
          <tr>{t.columns.map((c, k) => <th key={`${k}-${c}`} scope="col" className={`px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-canvas-muted ${k > 0 ? "text-right" : ""}`}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={`${ri}-${r[0]}`} className="border-t border-canvas-muted/20">
              {r.map((c, k) => k === 0
                ? <th key={k} scope="row" className="max-w-[28ch] break-words px-3 py-2 font-normal">{c}</th>
                : <td key={k} className="px-3 py-2 text-right font-mono tabular whitespace-nowrap">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pText = (p: number): string => (p < 0.001 ? "<0.001" : p.toFixed(3));

function V3Test({ t }: { t: ProofV3Test }) {
  const id = useId();
  const sign: ProofTable = { columns: ["Comparison", "Wins", "Losses", "Ties", "Pairs", "p"], rows: t.signTests.map((s) => [s.label, String(s.wins), String(s.losses), String(s.ties), String(s.pairs), pText(s.p)]) };
  const unit = t.perUnit?.columns[0]?.toLowerCase();
  return (
    <section aria-labelledby={id} data-testid="proof-v3-test" data-test-id={t.id} className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">{t.title}</h2>
      <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">{t.question}</p>
      <p className={eyebrow}>{t.status}</p>
      {t.runs.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-canvas-muted">
          {t.runs.map((r) => <li key={r.label} className="break-words"><span className="text-canvas-text">{r.label}</span> · protocol commit <span className="font-mono">{r.commit.slice(0, 7)}</span> · {r.status} · {r.note}</li>)}
        </ul>
      )}
      {t.tables.map((tb, k) => <TableView key={k} t={tb} label={`${t.title}: ${tb.columns[1] ?? "results"}`} />)}
      {t.signTests.length > 0 && <TableView t={sign} label={`${t.title}: sign tests`} />}
      <ul className="m-0 flex max-w-[68ch] list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.5] text-canvas-text">
        {t.claims.map((c, k) => <li key={`${k}-${c}`} className="break-words">{c}</li>)}
      </ul>
      {t.limits.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={eyebrow}>Limits</h3>
          <ul className="m-0 flex max-w-[68ch] list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.45] text-canvas-muted">
            {t.limits.map((c, k) => <li key={`${k}-${c}`} className="break-words">{c}</li>)}
          </ul>
        </div>
      )}
      {t.perUnit && (
        <details className="group flex flex-col gap-3">
          <summary className="inline-flex min-h-11 w-fit cursor-pointer items-center text-[14px] font-semibold text-canvas-text underline decoration-canvas-muted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Per {unit}</summary>
          <div className="mt-3"><TableView t={t.perUnit} label={`${t.title}: per ${unit}`} /></div>
        </details>
      )}
    </section>
  );
}

/** Stands in Test C's slot while the data has no C: the run is done, the human rating is not. */
function TestCPending() {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid="proof-v3-pending" data-test-id="C-pending" className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">Test C: are the picks real places in the city?</h2>
      <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">Run complete; human rating in progress. The result will be published here whatever it shows.</p>
      <p className="text-[15px]">
        <a href={PROTOCOL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-canvas-text underline decoration-canvas-muted underline-offset-4">Protocol amendments 4–6 on GitHub</a>
      </p>
    </section>
  );
}

/** Stands in Test B's second slot until Amendment 9's post-cutoff results are in the data. */
function A9Pending() {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid="proof-v3-a9-pending" data-test-id={`${A9_TEST_ID}-pending`} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">Test B after the model&apos;s cutoff</h2>
      <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">Running — results will be published here whatever they show.</p>
      <p className="text-[15px]">
        <a href={`${PROTOCOL_URL}#${AMENDMENT_9_ANCHOR}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-canvas-text underline decoration-canvas-muted underline-offset-4">Amendment 9 on GitHub: the cases, the rule and the claim rule, fixed before any case was collected</a>
      </p>
    </section>
  );
}

/** Amendment 10: planted errors caught and false alarms on clean controls, per product checker. */
function VerifiedClaims({ checkers }: { checkers: ProofCheckers | undefined }) {
  const id = useId();
  const cols = ["Checker", "What it guards", "Planted errors caught", "False alarms on clean controls", "Amendment"];
  return (
    <section aria-labelledby={id} data-testid="proof-checkers" className="flex min-w-0 flex-col gap-4">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">Verified claims, across the product</h2>
      {checkers ? (
        <>
          <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">Each checker was given 20 planted errors and 20 clean controls, from fixed, synthetic generators written down in Amendment {checkers.amendment} before any was run. These are checks, not comparisons: no significance test.</p>
          <div className="max-w-full overflow-x-auto rounded-[12px] bg-paper" tabIndex={0} role="group" aria-label="Verified claims, across the product, scrolls sideways">
            <table aria-label="Verified claims, across the product" className="w-full min-w-max border-collapse text-left text-[13px] text-canvas-text">
              <thead><tr>{cols.map((c, k) => <th key={c} scope="col" className={`px-3 py-2 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-canvas-muted ${k >= 2 && k <= 3 ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
              <tbody>
                {checkers.rows.map((r) => (
                  <tr key={r.id} className="border-t border-canvas-muted/20 align-top">
                    <th scope="row" className="max-w-[24ch] break-words px-3 py-2 font-normal">{r.checker}</th>
                    <td className="max-w-[36ch] break-words px-3 py-2">{r.guards}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap">{`${r.caught} of ${r.planted}`}</td>
                    <td className="px-3 py-2 text-right font-mono tabular whitespace-nowrap">{`${r.falseAlarms} of ${r.controls}`}</td>
                    <td className="px-3 py-2"><a href={`${PROTOCOL_URL}#${r.anchor || AMENDMENT_10_ANCHOR}`} target="_blank" rel="noopener noreferrer" aria-label={`Amendment ${checkers.amendment}: ${r.checker}`} className="inline-flex min-h-11 items-center underline decoration-canvas-muted underline-offset-4">{`Amendment ${checkers.amendment}`}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="m-0 flex max-w-[68ch] list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.45] text-canvas-muted">
            {checkers.rows.map((r) => <li key={r.id} className="break-words">{r.note}</li>)}
            {checkers.nameRuleOnly && <li className="break-words">{`With the sponsor classifier unavailable, the name rule alone caught ${checkers.nameRuleOnly.caught} of ${checkers.nameRuleOnly.planted}, with ${checkers.nameRuleOnly.falseAlarms} of ${checkers.nameRuleOnly.controls} false alarms.`}</li>}
          </ul>
        </>
      ) : (
        <p className="max-w-[68ch] text-[15px] leading-[1.5] text-canvas-text">The catch rates for the product&apos;s other checkers are not published yet. They will appear here whatever they show.</p>
      )}
      <p className="max-w-[68ch] text-[14px] leading-[1.45] text-canvas-muted">{`Engineering checks: ${ENGINEERING_TESTS.toLocaleString("en-US")} automated tests, the key rules mutation-checked, end-to-end specs on the live site. As of ${ENGINEERING_AS_OF}.`}</p>
    </section>
  );
}

function ProofV3View({ v3, children }: { v3: ProofV3; children?: ReactNode }) {
  const tests = [...v3.tests].sort((a, b) => { const ra = V3_ORDER.indexOf(a.id), rb = V3_ORDER.indexOf(b.id); return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb); });
  // Test C's slot: before the first test ranked after it (or at the end), only while the data has no C.
  const cRank = V3_ORDER.indexOf("C");
  const pendingAt = tests.some((x) => x.id === "C") ? -2 : tests.findIndex((x) => { const r = V3_ORDER.indexOf(x.id); return r < 0 || r > cRank; });
  const hasCatch = tests.some((x) => x.id === "catch");
  const hasA9 = tests.some((x) => x.id === A9_TEST_ID);
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 pb-8">
      <header className="flex flex-col gap-3">
        <p className={eyebrow}>PROOF · PRE-REGISTERED TESTS</p>
        <h1 className="font-title text-[32px] leading-[1.1] text-bone [text-wrap:balance] lg:text-[48px]">What we tested, and what held up</h1>
        <p className="max-w-[68ch] text-[16px] leading-[1.5] text-canvas-text">{V3_INTRO}</p>
        <p className="text-[15px]">
          <a href={PROTOCOL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-canvas-text underline decoration-canvas-muted underline-offset-4">Read the protocol and its amendments on GitHub</a>
        </p>
      </header>
      {tests.map((t, i) => (
        <Fragment key={t.id}>
          {pendingAt === i && <TestCPending />}
          {t.id === "A" && <h2 className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">Limits: where Qloo-backed ranking lost</h2>}
          <V3Test t={t} />
          {t.id === "B" && !hasA9 && <A9Pending />}
          {t.id === "catch" && <VerifiedClaims checkers={v3.checkers} />}
        </Fragment>
      ))}
      {!hasCatch && <VerifiedClaims checkers={v3.checkers} />}
      {pendingAt === -1 && <TestCPending />}
      {v3.amendments.length > 0 && (
        <section aria-label="Amendments" className="flex flex-col gap-3">
          <h2 className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">Amendments</h2>
          <ul className="m-0 flex max-w-[68ch] list-none flex-col gap-2 p-0 text-[14px] leading-[1.45] text-canvas-text">
            {v3.amendments.map((a) => <li key={a.n} className="break-words">Amendment {a.n} · <span className="font-mono">{a.commit.slice(0, 7)}</span> · {a.summary}</li>)}
          </ul>
        </section>
      )}
      {children}
    </div>
  );
}

function LegacyRuns({ data, header }: { data: Extract<Backtest, { status: "complete" }>; header: ReactNode }) {
  const everyId = useId();
  const run = data.runs[data.runs.length - 1]!;
  const first = data.runs[0]!;
  return (
    <>
      <div className="flex flex-col gap-4">
        {header}
        <p className="max-w-[68ch] text-[16px] leading-[1.5] text-canvas-text">
          We took {run.n} real city activations from {yearRange(run)} tours ({typeList(run)}) and checked whether each method put it in its top 10 for that city.
        </p>
        <Note run={run} />
      </div>
      <Boxscore run={run} />
      {data.runs.length >= 2 && <WhatThisShows />}
      <Lost run={run} label="Where we lost" />
      <section aria-labelledby={everyId} className="flex flex-col gap-4">
        <Heading id={everyId}>Every case</Heading>
        <div className="grid gap-3 lg:grid-cols-2">{run.cases.map((c) => <CaseCard key={c.id} c={c} />)}</div>
      </section>
      {data.runs.length >= 2 && <HowWeGotHere run={first} />}
      <Limitations run={run} />
      <footer className="break-words font-mono text-[12px] text-canvas-muted">
        Run {runDate(run)} · model {run.model} · reproduce with the steps in backtest/README.md
      </footer>
    </>
  );
}

/** The recorded Los Angeles playbook, where the comparison can be opened. */
const LA_PLAYBOOK = "/tours/playbook/5368361?showcase=1";

/** Method and circularity only: the numbers are live and per city, so none appear here. */
function SponsorsWithoutQlooSection() {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex max-w-[68ch] flex-col gap-2">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">The same model, without Qloo (sponsors)</h2>
      <p className="text-[16px] leading-[1.5] text-canvas-text">
        On a city playbook, the sponsors card has a comparison that asks Gemini alone which brands to pitch for that artist in that city, with no Qloo data, and places each of its picks on Qloo's fan ranking for the same city.
        It is measured on Qloo's own ranking, so it shows how far a model's memory strays from where the fans' taste is, not that Qloo is right.
      </p>
      <p className="text-[16px] leading-[1.5] text-canvas-text">
        The answer is live and differs by city, so there are no numbers here. Open it on the <Link to={LA_PLAYBOOK} className="underline underline-offset-4 hover:text-bone">Los Angeles playbook</Link> and press "Compare: the same model, without Qloo".
      </p>
    </section>
  );
}

export function ProofView({ data }: { data: Backtest }) {
  const earlierId = useId();
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
  if (data.proofV3) {
    return (
      <ProofV3View v3={data.proofV3}>
        <SponsorsWithoutQlooSection />
        {data.runs.length > 0 && (
          <section aria-labelledby={earlierId} className="flex flex-col gap-10 border-t border-canvas-muted/20 pt-10">
            <h2 id={earlierId} className="font-title text-[26px] leading-tight text-bone lg:text-[32px]">Earlier runs</h2>
            <LegacyRuns data={data} header={<p className={eyebrow}>ACTIVATION BACKTEST · {TITLE}</p>} />
          </section>
        )}
      </ProofV3View>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 pb-8">
      <LegacyRuns data={data} header={header} />
      <SponsorsWithoutQlooSection />
    </div>
  );
}

const dateText = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");
const seconds = (ms: number | null): string => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-canvas-muted">{label}</dt>
      <dd className="m-0 mt-0.5 break-words font-mono text-[18px] font-bold leading-snug text-canvas-text tabular">{value}</dd>
    </div>
  );
}

function ClaimCheckerPanel({ t }: { t: TrustStats }) {
  return (
    <section aria-label="Claim checker, live" data-testid="live-claims" className="min-w-0 rounded-[18px] bg-paper p-4">
      <h3 className={eyebrow}>Claim checker, live</h3>
      <p className="m-0 mt-3 break-words text-[15px] text-canvas-text">{`Playbooks built: ${t.playbooks} (${t.bySource.live} in the app, ${t.bySource.mcp_public} by AI agents via MCP)`}</p>
      {t.narratedPlaybooks > 0
        ? <p className="m-0 mt-2 break-words text-[15px] text-canvas-text">{`Claims checked in ${t.narratedPlaybooks} write-up${t.narratedPlaybooks === 1 ? "" : "s"}: ${t.claimsChecked}, removed ${t.claimsRemoved} (${t.claimsRemoved} of ${t.claimsChecked})`}</p>
        : <p className="m-0 mt-2 break-words text-[15px] text-canvas-text">{`Claims are checked whenever a playbook write-up is generated in the app; none yet since ${dateText(t.since)}.`}</p>}
      <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Median build time" value={seconds(t.medianLatencyMs)} />
        <Stat label="Sponsors hidden" value={String(t.sponsorsHidden)} />
      </dl>
      <p className="mt-3 text-[13px] leading-[1.45] text-canvas-muted">Since {dateText(t.since)}. Derived numbers only; no Qloo data is stored.</p>
    </section>
  );
}

function TeamPanel({ t }: { t: TeamStats }) {
  const o = t.overridesByField;
  const roles = Object.entries(t.notesByRole).filter(([, n]) => n > 0);
  return (
    <section aria-label="Team decisions, live" data-testid="live-team" className="min-w-0 rounded-[18px] bg-paper p-4">
      <h3 className={eyebrow}>Team decisions, live</h3>
      <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Workspaces" value={String(t.workspaces)} />
        <Stat label="Status changes" value={Object.values(t.statusCounts).reduce((a, b) => a + b, 0).toString()} />
      </dl>
      <p className="mt-3 break-words text-[14px] text-canvas-text">Statuses: {Object.entries(t.statusCounts).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>
      <p className="mt-1 break-words text-[14px] text-canvas-text">Overrides by field: Top zone {o.top_zone} · Best room {o.best_room} · Support {o.support}</p>
      <p className="mt-1 break-words text-[14px] text-canvas-text">Notes by role: {roles.length ? roles.map(([k, n]) => `${k} ${n}`).join(" · ") : "none yet"}</p>
      <p className="mt-3 text-[13px] leading-[1.45] text-canvas-muted">Excludes the seeded demo discussion.</p>
    </section>
  );
}

/** Live numbers from the optional analytics tables. Hidden when they are off; a skeleton while loading; never blocks the page. */
export function LiveStats({ trust, team }: { trust: TrustStats | { enabled: false } | null; team: TeamStats | { enabled: false } | null }) {
  const id = useId();
  if (trust === null || team === null) {
    return (
      <section aria-labelledby={id} aria-busy="true" data-testid="live-skeleton" className="mx-auto mb-10 flex w-full max-w-[1240px] flex-col gap-4">
        <h2 id={id} className="sr-only">Live numbers, loading</h2>
        <div className="grid gap-3 lg:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="h-[190px] animate-pulse rounded-[18px] bg-paper" />)}
        </div>
      </section>
    );
  }
  if (!trust.enabled && !team.enabled) return null;
  const since = dateText((trust.enabled ? trust.since : null) ?? (team.enabled ? team.since : null));
  return (
    <section aria-labelledby={id} data-testid="live-stats" className="mx-auto mb-10 flex w-full max-w-[1240px] flex-col gap-4">
      <h2 id={id} className="font-title text-[22px] leading-tight text-bone lg:text-[26px]">{since ? `Live since ${since}` : "Live now"}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {trust.enabled && <ClaimCheckerPanel t={trust} />}
        {team.enabled && <TeamPanel t={team} />}
      </div>
    </section>
  );
}

function LiveStatsLoader() {
  const off = isSampleMode();
  const trust = useStats("trust", !off);
  const team = useStats("team", !off);
  if (off) return null;
  return <LiveStats trust={trust} team={team} />;
}

export default function Proof() {
  const [, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const data = getBacktest();
  if (data) return <><LiveStatsLoader /><ProofView data={data} /></>;
  const retry = () => { setRetrying(true); void loadRecordings().finally(() => { setRetrying(false); setTick((n) => n + 1); }); };
  return (
    <>
    <LiveStatsLoader />
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 pb-8">
      <header className="flex flex-col gap-3">
        <p className={eyebrow}>PROOF · ACTIVATION BACKTEST</p>
        <h1 className="font-title text-[32px] leading-[1.1] text-bone [text-wrap:balance] lg:text-[48px]">{TITLE}</h1>
      </header>
      <p className="text-[16px] text-canvas-muted">Proof results are unavailable right now.</p>
      <button type="button" onClick={retry} disabled={retrying} className="inline-flex min-h-12 w-fit items-center rounded-[10px] bg-paper-raised px-5 text-[15px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-60">Retry</button>
    </div>
    </>
  );
}