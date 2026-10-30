import { toolPlainName } from "./labels";
import type { GatewayEvent } from "./types";

export interface CityCalls { id: string; name: string; calls: number; /** Plain tool names, each once, in first-use order. */ tools: string[]; /** What those calls decided, each once. */ decided: string[] }
export interface CallSummary { board: number; /** Cities in the book that have a playbook log. */ playbookCount: number; playbooks: number; total: number; cities: CityCalls[] }

const isCall = (e: GatewayEvent): e is Extract<GatewayEvent, { type: "tool_call" }> => e.type === "tool_call";
export const countCalls = (log: GatewayEvent[]): number => log.filter(isCall).length;

/** The card a Qloo call fed. */
export function callPurpose(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "qloo_where_popular": return "promo zones and fan heat";
    case "qloo_recommend": return args.target_type === "brand" ? "sponsors" : args.target_type === "place" ? "venues" : "related tastes";
    case "qloo_rank": return "venues";
    case "qloo_compare_audiences": return "support acts";
    case "qloo_entity_tags": return "merch";
    case "qloo_describe": return "acts fans love";
    case "qloo_trends": return "momentum";
    case "qloo_audience_demographics": return "audience profile";
    default: return "other lookups";
  }
}

const unique = (xs: string[]): string[] => [...new Set(xs)];

/** Both the board chip and the Tour Book read these counts from the same logs, so the parts always add up. */
export function summariseCalls(boardLog: GatewayEvent[], playbooks: Array<{ id: string; name: string; log: GatewayEvent[] }>): CallSummary {
  const cities = playbooks.map<CityCalls>(({ id, name, log }) => {
    const calls = log.filter(isCall);
    return { id, name, calls: calls.length, tools: unique(calls.map((c) => toolPlainName(c.tool, c.args))), decided: unique(calls.map((c) => callPurpose(c.tool, c.args))) };
  });
  const board = countCalls(boardLog);
  const pb = cities.reduce((n, c) => n + c.calls, 0);
  return { board, playbookCount: playbooks.length, playbooks: pb, total: board + pb, cities };
}

const requests = (n: number): string => `${n} Qloo ${n === 1 ? "request" : "requests"}`;
export const requestsLine = (s: CallSummary): string => `This book used ${requests(s.total)} (board ${s.board} + playbooks ${s.playbooks}).`;
/** The provenance summary: "This book: 74 Qloo requests (board 42 + 3 playbooks 32)". */
export const provenanceLine = (s: CallSummary): string =>
  `This book: ${requests(s.total)} (board ${s.board} + ${s.playbookCount} ${s.playbookCount === 1 ? "playbook" : "playbooks"} ${s.playbooks})`;
