import type { ComponentName, ScoringConfig, Thresholds, Verdict } from "./types";

/** Display copy and encodings shared by every Qloo screen. One source, so they cannot drift. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  play: "Play", hidden_goldmine: "Hidden goldmine", de_risk: "De-risk", consider: "Consider", skip: "Skip", insufficient_data: "Not enough data",
};

export const INTEGRITY_LINE = "Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals.";
export const SAMPLE_TEXT = "Sample data — illustrative, not Qloo output";
/** Label for a recorded run. A placeholder recording (no date) is honestly the sample. */
export const recordedText = (recordedAt: string | null): string => (recordedAt ? `Recorded Qloo run · ${recordedAt.slice(0, 10)} — not live` : SAMPLE_TEXT);

/** Activation component weights as the gateway applies them (display only). */
export const ACTIVATION_WEIGHTS: ReadonlyArray<{ key: ComponentName; label: string; short: string; weight: string }> = [
  { key: "sponsor_fit", label: "Sponsor fit", short: "Sponsor", weight: "0.30" },
  { key: "local_hooks", label: "Local hooks", short: "Hooks", weight: "0.25" },
  { key: "fan_concentration", label: "Fan concentration", short: "Concentration", weight: "0.25" },
  { key: "venue_fit", label: "Venue fit", short: "Venue", weight: "0.20" },
];

/** Mirrors the gateway's DEFAULT_SCORING; used only when a run carries no scoring event (sample data, older recordings). */
export const DEFAULT_SCORING_DISPLAY: ScoringConfig = {
  version: "default",
  weights: { sponsor_fit: 0.3, local_hooks: 0.25, fan_concentration: 0.25, venue_fit: 0.2 },
  affinityFloors: { sponsor_fit: 0, local_hooks: 0, venue_fit: 0 },
  concentration: "raw",
  thresholds: { playFan: 70, playAct: 60, goldmineFanMin: 45, goldmineFanMax: 70, goldmineAct: 75, deRiskFan: 70, deRiskAct: 45, considerWin: 55 },
};

export interface RuleLine { key: string; /** Absent on the capped line, which is not a verdict. */ verdict?: Verdict; label: string; rule: string }
const rule = (verdict: Verdict, text: string): RuleLine => ({ key: verdict, verdict, label: VERDICT_LABEL[verdict], rule: text });
const CAPPED_RULE_TEXT = "not available (capped at Consider, no Qloo fan-heat evidence)";

/** The verdict rules a score sheet lists. A capped seed (fanHeatFloor) has its fan heat at the board's floor, so one capped line replaces the Play, Hidden goldmine and De-risk rules. */
export function ruleLines(t: Thresholds, capped = false): RuleLine[] {
  const tail = [rule("consider", `winnability ≥${t.considerWin}`), rule("skip", "otherwise"), rule("insufficient_data", "when inputs are missing")];
  if (capped) return [{ key: "capped", label: "Play, Hidden goldmine, De-risk", rule: CAPPED_RULE_TEXT }, ...tail];
  return [
    rule("play", `fan ≥${t.playFan} & activation ≥${t.playAct}`),
    rule("hidden_goldmine", `${t.goldmineFanMin}≤fan<${t.goldmineFanMax} & activation ≥${t.goldmineAct}`),
    rule("de_risk", `fan ≥${t.deRiskFan} & activation <${t.deRiskAct}`),
    ...tail,
  ];
}

export function weightRows(s: ScoringConfig): Array<{ key: ComponentName; label: string; weight: string; dropped: boolean }> {
  return ACTIVATION_WEIGHTS.map(({ key, label }) => ({ key, label, weight: s.weights[key].toFixed(2), dropped: s.weights[key] === 0 }));
}

export const CLOSE_CALL_LABEL = "Close call";
export const DEFAULT_CLOSE_CALL_BAND = 2;
export const CAPPED_CLOSE_CALL_NOTE = "Close to the Consider line. This market is capped at Consider, so it can't become Play or Hidden goldmine.";
export const closeCallNote = (band: number = DEFAULT_CLOSE_CALL_BAND) => `Within ${band} points of a verdict line — treat as borderline.`;

/** Shown wherever an insufficient_data city has insufficientReason "location_unresolved" (Qloo resolved its name to another place). */
export const LOCATION_UNRESOLVED_NOTE = "Qloo couldn't place this city precisely, so we didn't score it.";
export const LOCATION_UNRESOLVED_SHORT = "Couldn't place this city";

/** Tag and explainer for a major-market seed (candidateSource "major_market"). Never says Qloo "found" it. */
export const MAJOR_MARKET_LABEL = "Major market";
const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return undefined; } })();
/** Shown for a floored major-market seed: its verdict can never be Play or Hidden goldmine. */
export const FLOORED_SEED_NOTE = "Capped at Consider: no Qloo fan-heat evidence for this market.";
/** The capped line applies to a floored seed only when the cap is what decided its verdict. */
export const showsCappedNote = (c: { fanHeatFloor?: boolean; verdict: Verdict }): boolean => c.fanHeatFloor === true && c.verdict === "consider";
export const countryLabel = (iso2: string): string => { try { return regionNames?.of(iso2) ?? iso2; } catch { return iso2; } };
export const majorMarketNote = (iso2: string): string =>
  `Largest market in ${countryLabel(iso2)}. We always check it; it isn't in Qloo's top fan hotspots for this artist, so fan heat is shown at the board's floor.`;

export type VerdictShape = "circle" | "diamond" | "triangle" | "ring" | "x" | "square";
/** DESIGN.md section 2.5: shape carries the verdict on the map, the matrix and every legend. */
export const VERDICT_SHAPE: Record<Verdict, VerdictShape> = {
  play: "circle", hidden_goldmine: "diamond", de_risk: "triangle", consider: "ring", skip: "x", insufficient_data: "square",
};

/** Shown where a showcase city has no recorded playbook (the recording holds a few; live mode opens any city). */
export const recordedPlaybooksLine = (n: number): string =>
  `Playbooks are recorded for ${n} ${n === 1 ? "city" : "cities"} in this example. Try your own artist to open any city.`;

const TOOL_PLAIN: Record<string, string> = {
  qloo_describe: "Artist lookup", qloo_audience_demographics: "Fan demographics", qloo_entity_tags: "Fan taste tags", qloo_trends: "Momentum trend",
  qloo_where_popular: "Fan hotspots", qloo_rank: "Venue ranking", qloo_compare_audiences: "Audience comparison", qloo_find_tags: "Tag search",
};
const RECOMMEND_PLAIN: Record<string, string> = { brand: "Sponsor recommendations", place: "Venue recommendations", artist: "Artist recommendations" };
/** A Qloo tool's plain name for promoters (provenance, logs); `args` tells the flavours of qloo_recommend apart. */
export function toolPlainName(tool: string, args: Record<string, unknown> = {}): string {
  if (tool === "qloo_recommend") return RECOMMEND_PLAIN[String(args.target_type ?? "")] ?? "Recommendations";
  return TOOL_PLAIN[tool] ?? tool.replace(/^qloo_/, "").replace(/_/g, " ");
}
/** Visible form of a Qloo tool id: plain words, never the raw id ("qloo_where_popular"). */
export const toolLabel = (tool: string, args: Record<string, unknown> = {}): string => `Qloo: ${toolPlainName(tool, args).toLowerCase()}`;
const STATUS_PLAIN: Record<string, string> = {
  ok: "Done", empty: "No results", partial: "Partial answer", degraded: "Partial answer", error: "Error", needs_input: "Needed more input (skipped)", rejected: "Not sent (failed safety check)",
};
export const statusPlain = (status: string): string => STATUS_PLAIN[status] ?? status;
