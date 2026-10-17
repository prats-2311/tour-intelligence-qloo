import raw from "./fixtures/backtest.json";

/** Mirrors cloud_run/qloo_gateway/src/backtest/score.ts (re-declared: the dashboard build cannot import gateway code). */
export type Method = "qloo_playbook" | "city_popularity" | "llm_only";
export type MethodResult =
  | { status: "ok"; rank: number | null; top: Array<{ name: string; entityId?: string }>; note?: "rank_unavailable" }
  | { status: "unavailable"; reason: string };
export interface MethodSummary { scored: number; hit10: number; hit20: number }
export interface CaseResult {
  id: string; artist: string; city: string; country: string;
  activationType: "sponsor" | "merch_collab" | "local_artist";
  decision: "Which sponsor to pitch" | "The merch angle" | "Who goes on the bill";
  realEntity: { name: string; entityId: string | null; resolved: boolean };
  date: string; sources: string[]; summary: string;
  results: Record<Method, MethodResult>;
}
export interface BacktestRun {
  schemaVersion: 1; status: "complete"; runAt: string; model: string;
  /** Files without a method are run 1 (v1). */
  method: "v1" | "v2"; methodNote?: string;
  cutoff: 10; wideCutoff: 20; methods: Method[]; n: number;
  cases: CaseResult[]; summary: Record<Method, MethodSummary>; lost: string[];
}
export type Backtest = { status: "pending" } | { status: "complete"; runs: BacktestRun[] };

export const METHOD_LABEL: Record<Method, string> = {
  qloo_playbook: "Qloo playbook", city_popularity: "City popularity (Qloo, no artist)", llm_only: "Generic LLM (no Qloo)",
};
export const PROOF_LINK_TEXT = "Checked against real tours";
export const METHODS: Method[] = ["qloo_playbook", "city_popularity", "llm_only"];

const isInt = (n: unknown): boolean => Number.isInteger(n);
const validResult = (r: unknown): boolean => {
  const x = r as { status?: string; rank?: unknown } | null;
  return !!x && (x.status === "unavailable" || (x.status === "ok" && (x.rank === null || isInt(x.rank))));
};
const validCase = (c: unknown): c is CaseResult => {
  const x = c as Partial<CaseResult> | null;
  return !!x && typeof x.id === "string" && !!x.realEntity && typeof x.realEntity.name === "string" && Array.isArray(x.sources)
    && x.sources.every((u) => typeof u === "string" && /^https?:\/\//i.test(u)) && !!x.results && METHODS.every((m) => validResult(x.results![m]));
};

function parseRun(input: unknown): BacktestRun | null {
  const d = input as Partial<BacktestRun> | null;
  // "partial" runs (a method failed mid-run) are never shown.
  if (!d || typeof d !== "object" || d.schemaVersion !== 1 || d.status !== "complete") return null;
  if (!Array.isArray(d.cases) || !d.summary || !Array.isArray(d.lost) || typeof d.runAt !== "string" || typeof d.model !== "string") return null;
  if (!METHODS.every((m) => d.summary![m] && isInt(d.summary![m].scored) && isInt(d.summary![m].hit10) && isInt(d.summary![m].hit20))) return null;
  if (!d.cases.every(validCase)) return null;
  // A loss that matches no case would vanish from the page and could read as an all-clear: reject the whole run instead.
  const ids = new Set(d.cases.map((c) => c.id));
  if (!d.lost.every((id) => ids.has(id))) return null;
  return { ...(d as BacktestRun), method: d.method === "v2" ? "v2" : "v1" };
}

export function parseBacktest(input: unknown): Backtest {
  const list = (input as { runs?: unknown } | null)?.runs;
  if (!Array.isArray(list)) return { status: "pending" };
  const runs = list.map(parseRun).filter((r): r is BacktestRun => r !== null);
  return runs.length === 0 ? { status: "pending" } : { status: "complete", runs };
}

export function hitLine(s: MethodSummary, cut: 10 | 20): string {
  if (s.scored === 0) return "no scored cases";
  const hits = cut === 10 ? s.hit10 : s.hit20;
  return `${hits} of ${s.scored} in the top ${cut} · ${Math.round((100 * hits) / s.scored)}%`;
}

export const rankText = (r: MethodResult): string => (r.status !== "ok" ? "no answer" : r.rank === null ? "not in top 20" : `#${r.rank}`);
export const BACKTEST: Backtest = parseBacktest(raw);
