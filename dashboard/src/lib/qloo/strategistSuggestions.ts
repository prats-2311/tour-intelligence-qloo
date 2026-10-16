import type { StrategistContext } from "./types";

/** Three generic, board-aware questions for live mode. City names only, never numbers. */
export function liveSuggestions(context: StrategistContext): string[] {
  const cities = context.cities ?? [];
  const goldmine = cities.find((c) => c.verdict === "hidden_goldmine");
  const best = [...cities].sort((a, b) => (b.winnability ?? -1) - (a.winnability ?? -1))[0];
  const top = goldmine ?? best;
  const focus = cities.find((c) => c.id === context.focusCityId) ?? top;
  return [
    top ? `Why is ${top.name} ranked here?` : "Which market should we prioritise?",
    focus ? `Who should open in ${focus.name}?` : "Who should open the tour?",
    "Which market is riskiest?",
  ];
}
