import { toolLabel } from "@/components/strategist/ToolChips";
import type { StrategistTurn } from "./strategistReducer";

const cityOf = (args: Record<string, unknown>): string | undefined => {
  const v = [args.city, args.within, args.filter_location, args.signal_location].find((x): x is string => typeof x === "string" && x.trim() !== "");
  return v?.split(",")[0]!.trim();
};

/** What the strategist is doing right now, from streamed events only. */
export function stageLabel(turn: Pick<StrategistTurn, "stage" | "tools">): string {
  const last = turn.tools[turn.tools.length - 1];
  if (turn.stage === "writing") return "Writing the answer…";
  if (last && !last.status) { const c = cityOf(last.args); return `Looking up ${toolLabel(last.name)}${c ? ` for ${c}` : ""}…`; }
  if (last) return "Writing the answer…";
  return "Reading the question…";
}
