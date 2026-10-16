import { normaliseName } from "../claims/verify.js";
import type { ActivationType } from "./cases.js";

export type Method = "qloo_playbook" | "city_popularity" | "llm_only";
export const METHODS: Method[] = ["qloo_playbook", "city_popularity", "llm_only"];
export const CUTOFF = 10;
export const WIDE_CUTOFF = 20;

export interface RankedItem { name: string; entityId?: string }
export interface Target { name: string; aliases?: string[]; entityId: string | null }
export type MethodResult = { status: "ok"; rank: number | null; top: RankedItem[] } | { status: "unavailable"; reason: string };
export type Decision = "Which sponsor to pitch" | "The merch angle" | "Who goes on the bill";

export interface CaseResult {
  id: string; artist: string; city: string; country: string;
  activationType: ActivationType; decision: Decision;
  realEntity: { name: string; entityId: string | null; resolved: boolean };
  date: string; sources: string[]; summary: string;
  results: Record<Method, MethodResult>;
}
export interface MethodSummary { scored: number; hit10: number; hit20: number }
export interface BacktestResults {
  schemaVersion: 1; status: "complete" | "partial"; runAt: string; model: string;
  cutoff: typeof CUTOFF; wideCutoff: typeof WIDE_CUTOFF; methods: Method[];
  n: number; cases: CaseResult[]; summary: Record<Method, MethodSummary>; lost: string[];
}

export const targetType = (t: ActivationType): "brand" | "artist" => (t === "local_artist" ? "artist" : "brand");

export function decisionFor(t: ActivationType): Decision {
  if (t === "sponsor") return "Which sponsor to pitch";
  if (t === "merch_collab") return "The merch angle";
  return "Who goes on the bill";
}

/** 1-based rank of the target within the first WIDE_CUTOFF items, or null. Ids decide when both sides have one. */
export function findRank(items: RankedItem[], target: Target): number | null {
  const names = new Set([target.name, ...(target.aliases ?? [])].map(normaliseName).filter((n) => n !== ""));
  const top = items.slice(0, WIDE_CUTOFF);
  for (let i = 0; i < top.length; i += 1) {
    const it = top[i]!;
    if (target.entityId && it.entityId) { if (it.entityId === target.entityId) return i + 1; continue; }
    if (names.has(normaliseName(it.name))) return i + 1;
  }
  return null;
}

export const methodResult = (items: RankedItem[], target: Target): MethodResult =>
  ({ status: "ok", rank: findRank(items, target), top: items.slice(0, CUTOFF) });

export function summarise(cases: CaseResult[]): Record<Method, MethodSummary> {
  const out = Object.fromEntries(METHODS.map((m) => [m, { scored: 0, hit10: 0, hit20: 0 }])) as Record<Method, MethodSummary>;
  for (const c of cases) for (const m of METHODS) {
    const r = c.results[m];
    if (r.status !== "ok") continue;
    out[m].scored += 1;
    if (r.rank !== null && r.rank <= CUTOFF) out[m].hit10 += 1;
    if (r.rank !== null && r.rank <= WIDE_CUTOFF) out[m].hit20 += 1;
  }
  return out;
}

const better = (a: number | null, b: number | null) => a !== null && (b === null || a < b);

export function lostCases(cases: CaseResult[]): string[] {
  return cases.filter((c) => {
    const ours = c.results.qloo_playbook;
    if (ours.status !== "ok") return false;
    return METHODS.filter((m) => m !== "qloo_playbook").some((m) => {
      const r = c.results[m];
      return r.status === "ok" && better(r.rank, ours.rank);
    });
  }).map((c) => c.id);
}

export function buildResults(cases: CaseResult[], meta: { runAt: string; model: string; status?: "complete" | "partial" }): BacktestResults {
  return {
    schemaVersion: 1, status: meta.status ?? "complete", runAt: meta.runAt, model: meta.model,
    cutoff: CUTOFF, wideCutoff: WIDE_CUTOFF, methods: METHODS,
    n: cases.length, cases, summary: summarise(cases), lost: lostCases(cases),
  };
}
