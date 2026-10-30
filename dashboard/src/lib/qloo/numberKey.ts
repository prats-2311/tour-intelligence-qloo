/** One line per number a playbook card shows, in plain words. Shown in the "How to read these numbers" key near the tabs. */
export const NUMBER_KEY: Array<{ term: string; text: string }> = [
  { term: "Affinity", text: "0 to 1. How strongly these fans like it compared with other options." },
  { term: "Fan rank / city rank", text: "Where these fans put it, and where the whole city does. #1 is the top." },
  { term: "Venue fit", text: "0 to 1. How well the room matches what these fans like." },
  { term: "Shared taste", text: "0 to 1. How similar the two audiences' taste is, not a share of fans." },
  { term: "Share", text: "A zone's share of the fan heat found in this city." },
];

/** Short tooltip text (title and screen-reader description) for a numeric label in a card. */
export const HINT = {
  affinity: "Affinity, 0 to 1: how strongly these fans like it compared with other options.",
  rank: "Fan rank: where these fans put it. City rank: where the whole city does. #1 is the top.",
  venueFit: "Venue fit, 0 to 1: how well the room matches what these fans like.",
  share: "Share of the fan heat found in this city.",
} as const;

/** True for every value that equals another (to the two decimals the cards show): equal scores are "tied", not a ranking. */
export function tiedFlags(values: number[]): boolean[] {
  const key = (v: number) => v.toFixed(2);
  return values.map((v) => values.filter((w) => key(w) === key(v)).length > 1);
}
