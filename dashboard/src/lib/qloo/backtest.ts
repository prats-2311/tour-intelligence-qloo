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
/**
 * Proof v3 (docs/qloo/proof-v3-protocol.md), mirrored from cloud_run/qloo_gateway/src/backtest/proofPublish.ts. Tables hold pre-formatted strings,
 * so the page renders any test generically and a new one (Test C) arrives as data only.
 */
export interface ProofTable { columns: string[]; rows: string[][] }
export interface ProofSignLine { label: string; wins: number; losses: number; ties: number; pairs: number; p: number }
export interface ProofRunLine { label: string; commit: string; status: "complete" | "stopped"; note: string }
export interface ProofV3Test {
  id: string; title: string; question: string; status: string; n: number;
  tables: ProofTable[]; signTests: ProofSignLine[]; claims: string[]; limits: string[]; runs: ProofRunLine[]; perUnit: ProofTable | null;
}
/** Amendment 10: counts per product checker (no case text), mirrored from proofPublish.ts. */
export interface ProofChecker { id: string; checker: string; guards: string; caught: number; planted: number; falseAlarms: number; controls: number; claim: string; anchor: string; note: string }
export interface ProofCheckers { amendment: number; rows: ProofChecker[]; nameRuleOnly?: { caught: number; planted: number; falseAlarms: number; controls: number } }
export interface ProofV3 { protocolCommit: string; generatedAt: string; amendments: Array<{ n: number; commit: string; summary: string }>; tests: ProofV3Test[]; checkers?: ProofCheckers }
export type Backtest = { status: "pending" } | { status: "complete"; runs: BacktestRun[]; proofV3?: ProofV3 };
export type BacktestRuns = Extract<Backtest, { status: "complete" }>;

export const METHOD_LABEL: Record<Method, string> = {
  qloo_playbook: "Qloo playbook", city_popularity: "City popularity (Qloo, no artist)", llm_only: "Generic LLM (no Qloo)",
};
export const PROOF_LINK_TEXT = "How we tested it";
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

const isStr = (x: unknown): x is string => typeof x === "string";
const strs = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const validTable = (t: unknown): t is ProofTable => {
  const x = t as Partial<ProofTable> | null;
  return !!x && strs(x.columns) && Array.isArray(x.rows) && x.rows.every(strs);
};
const validSign = (s: unknown): s is ProofSignLine => {
  const x = s as Partial<ProofSignLine> | null;
  return !!x && isStr(x.label) && num(x.wins) && num(x.losses) && num(x.ties) && num(x.pairs) && num(x.p);
};
const validRunLine = (r: unknown): r is ProofRunLine => {
  const x = r as Partial<ProofRunLine> | null;
  return !!x && isStr(x.label) && isStr(x.commit) && isStr(x.note) && (x.status === "complete" || x.status === "stopped");
};
function parseTest(t: unknown): ProofV3Test | null {
  const x = t as Partial<ProofV3Test> | null;
  if (!x || !isStr(x.id) || !isStr(x.title) || !isStr(x.question) || !isStr(x.status) || !num(x.n)) return null;
  if (!Array.isArray(x.tables) || !x.tables.every(validTable) || !strs(x.claims) || !strs(x.limits)) return null;
  if (!Array.isArray(x.signTests) || !x.signTests.every(validSign)) return null;
  if (x.runs !== undefined && !(Array.isArray(x.runs) && x.runs.every(validRunLine))) return null;
  if (x.perUnit !== null && x.perUnit !== undefined && !validTable(x.perUnit)) return null;
  return { ...(x as ProofV3Test), runs: x.runs ?? [], perUnit: x.perUnit ?? null };
}
const validChecker = (r: unknown): r is ProofChecker => {
  const x = r as Partial<ProofChecker> | null;
  return !!x && isStr(x.id) && isStr(x.checker) && isStr(x.guards) && num(x.caught) && num(x.planted) && num(x.falseAlarms) && num(x.controls) && isStr(x.anchor) && isStr(x.note) && isStr(x.claim);
};
function parseCheckers(c: unknown): ProofCheckers | undefined {
  const x = c as Partial<ProofCheckers> | null;
  if (!x || !Array.isArray(x.rows) || x.rows.length === 0 || !x.rows.every(validChecker)) return undefined;
  const n = x.nameRuleOnly;
  const nameRuleOnly = n && num(n.caught) && num(n.planted) && num(n.falseAlarms) && num(n.controls) ? { caught: n.caught, planted: n.planted, falseAlarms: n.falseAlarms, controls: n.controls } : undefined;
  return { amendment: num(x.amendment) ? x.amendment : 10, rows: x.rows, ...(nameRuleOnly ? { nameRuleOnly } : {}) };
}
/** Optional and back-compatible: a malformed test is dropped, the rest still show. */
function parseProofV3(input: unknown): ProofV3 | undefined {
  const d = input as Partial<ProofV3> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.tests)) return undefined;
  const tests = d.tests.map(parseTest).filter((t): t is ProofV3Test => t !== null);
  if (tests.length === 0) return undefined;
  const amendments = Array.isArray(d.amendments) ? d.amendments.filter((a) => !!a && num(a.n) && isStr(a.commit) && isStr(a.summary)) : [];
  const checkers = parseCheckers(d.checkers);
  return { protocolCommit: isStr(d.protocolCommit) ? d.protocolCommit : "", generatedAt: isStr(d.generatedAt) ? d.generatedAt : "", amendments, tests, ...(checkers ? { checkers } : {}) };
}

export function parseBacktest(input: unknown): Backtest {
  const raw = input as { runs?: unknown; proofV3?: unknown } | null;
  const list = Array.isArray(raw?.runs) ? raw!.runs : [];
  const runs = list.map(parseRun).filter((r): r is BacktestRun => r !== null);
  const proofV3 = parseProofV3(raw?.proofV3);
  if (runs.length === 0 && !proofV3) return { status: "pending" };
  return { status: "complete", runs, ...(proofV3 ? { proofV3 } : {}) };
}

export function hitLine(s: MethodSummary, cut: 10 | 20): string {
  if (s.scored === 0) return "no scored cases";
  const hits = cut === 10 ? s.hit10 : s.hit20;
  return `${hits} of ${s.scored} in the top ${cut} · ${Math.round((100 * hits) / s.scored)}%`;
}

export const rankText = (r: MethodResult): string => (r.status !== "ok" ? "no answer" : r.rank === null ? "not in top 20" : `#${r.rank}`);

let BACKTEST: BacktestRuns | null = null;
/** The two private backtest runs, or null until they load (or when they are unavailable). */
export const getBacktest = (): BacktestRuns | null => BACKTEST;
/** Sets the loaded backtest; anything that does not parse to complete runs leaves it null. */
export function setBacktest(raw: unknown): void {
  const parsed = parseBacktest(raw);
  BACKTEST = parsed.status === "complete" ? parsed : null;
}

