import { VERDICT_LABEL } from "./labels";
import type { GatewayEvent } from "./types";

export type LogStep = { id: string; sentence: string; tool?: string; status: "active" | "success" | "error" | "info"; detail?: string; cached?: boolean; stale?: boolean };

const where = (a: Record<string, unknown>) => String(a.signal_location ?? a.filter_location ?? a.within ?? "");

function sentenceFor(tool: string, a: Record<string, unknown>): string {
  switch (tool) {
    case "qloo_describe": return `Looking up ${String(a.entity ?? "the artist")} in Qloo`;
    case "qloo_audience_demographics": return "Profiling the fan base";
    case "qloo_entity_tags": return "Finding the tastes that define the fan base";
    case "qloo_trends": return "Checking momentum over the last 90 days";
    case "qloo_where_popular": return `Finding where fans concentrate in ${String(a.within ?? "the region")}`;
    case "qloo_rank": return `Ranking venues${where(a) ? ` in ${where(a)}` : ""}`;
    case "qloo_compare_audiences": return "Comparing audience overlap with a possible support act";
    case "qloo_find_tags": return `Searching Qloo tags for "${String(a.query ?? "")}"`;
    case "qloo_recommend": {
      const t = String(a.target_type ?? "");
      const w = where(a);
      if (t === "brand") return `Checking sponsor fit in ${w}`;
      if (t === "place") return `Finding venues and places fans love in ${w}`;
      if (t === "artist") return `Finding artists fans in ${w} also love`;
      if (t === "movie" || t === "tv_show") return `Finding films and shows fans in ${w} also love`;
      return `Finding related tastes in ${w}`;
    }
    default: return `Calling ${tool}`;
  }
}

function unitFor(tool: string, a: Record<string, unknown>, n: number): string {
  if (tool === "qloo_where_popular") return `${n} hotspots`;
  if (tool === "qloo_recommend" && a.target_type === "brand") return `${n} brands`;
  return `${n} results`;
}

function detailFor(tool: string, a: Record<string, unknown>, status: string, n: number): string {
  const unit = unitFor(tool, a, n);
  if (status === "partial") return `${unit} · partial result`;
  if (status === "degraded") return `${unit} · degraded`;
  return unit;
}

export function narrate(events: GatewayEvent[]): LogStep[] {
  const steps: LogStep[] = [];
  // Tool results are paired with tool calls by FIFO per tool name (R11):
  // the gateway pushes each tool_call immediately followed by its own tool_result,
  // so we find the earliest open call for that tool and match it to the result.
  const open: Array<{ step: LogStep; tool: string; args: Record<string, unknown> }> = [];
  events.forEach((e, i) => {
    const id = String(i);
    switch (e.type) {
      case "tool_call": {
        const step: LogStep = { id, sentence: sentenceFor(e.tool, e.args), tool: e.tool, status: "active", cached: e.cached };
        steps.push(step);
        open.push({ step, tool: e.tool, args: e.args });
        return;
      }
      case "tool_result": {
        const idx = open.findIndex((o) => o.tool === e.tool);
        if (idx === -1) {
          // Orphan tool_result (no matching open call) — create an info step instead of dropping
          steps.push({ id, sentence: `Received ${e.tool} result`, status: "info" });
          return;
        }
        const [{ step, args }] = open.splice(idx, 1) as [{ step: LogStep; tool: string; args: Record<string, unknown> }];
        if (e.status === "needs_input") {
          step.status = "info";
          step.detail = "needs a choice";
        } else if (e.status === "error") {
          step.status = "error";
          step.detail = "Qloo returned an error";
        } else {
          step.status = "success";
          if (e.status === "empty") {
            step.detail = "no results";
          } else if (e.status === "ok" && e.resultCount === 0) {
            step.detail = "no results";
          } else if (e.status === "partial" || e.status === "degraded") {
            step.detail = detailFor(e.tool, args, e.status, e.resultCount);
          } else {
            step.detail = unitFor(e.tool, args, e.resultCount);
          }
        }
        step.stale = e.stale;
        return;
      }
      case "resolve": steps.push({ id, sentence: `Matched artist: ${e.entity.name}`, status: "info" }); return;
      case "region_empty": steps.push({ id, sentence: `No Qloo signal in ${e.region}`, status: "info" }); return;
      case "region_unavailable": steps.push({ id, sentence: `Qloo data unavailable for ${e.region}`, status: "error", detail: e.code }); return;
      case "city_scored": {
        const w = e.city.winnability.value;
        steps.push({ id, sentence: `Scored ${e.city.name} — ${VERDICT_LABEL[e.city.verdict]}${w === null ? "" : `, winnability ${Math.round(w)}`}`, status: "info" });
        return;
      }
      case "needs_input": steps.push({ id, sentence: "Several artists match — needs a choice", status: "info" }); return;
      case "error": steps.push({ id, sentence: e.message, status: "error", detail: e.code }); return;
      default: return;
    }
  });
  return steps;
}

export function countQlooCalls(events: GatewayEvent[]): { total: number; cached: number } {
  const calls = events.filter((e): e is Extract<GatewayEvent, { type: "tool_call" }> => e.type === "tool_call");
  return { total: calls.length, cached: calls.filter((c) => c.cached).length };
}
