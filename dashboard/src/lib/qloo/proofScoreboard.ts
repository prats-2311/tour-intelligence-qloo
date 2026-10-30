import type { ProofSignLine, ProofV3, ProofV3Test } from "./backtest";

/** One line of the /proof scoreboard; `anchor` is the id of the section that holds the evidence. */
export interface ScoreEntry { anchor: string; text: string }
export interface Scoreboard { qloo: ScoreEntry[]; llm: ScoreEntry[]; even: ScoreEntry[]; notWins: ScoreEntry[] }

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const pText = (p: number): string => (p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`);
const sig = (p: number): string => (p < 0.05 ? pText(p) : `not significant (${pText(p)})`);
const anchorOf = (id: string): string => `proof-test-${id}`;

/** Qloo against a plain LLM (Gemini, or the LLM-only playbook), tests in the order the scoreboard shows them. The sign lines count Qloo's wins first. */
const LLM_TESTS = [
  { id: "A", name: "Test A, choosing tour cities", who: "the plain LLM", us: "winnability", unit: "artists" },
  { id: "B", name: "Test B, the real activation pick, against Gemini", who: "Gemini", us: "Qloo", unit: "cases" },
  { id: "C", name: "Test C, do the names exist in the city", who: "the plain LLM", us: "Qloo", unit: "cities" },
  { id: "B_post_cutoff", name: "Test B after the model's cutoff, against Gemini", who: "Gemini", us: "Qloo", unit: "cases" },
] as const;
const POPULARITY_TESTS = [
  { id: "B", lead: "Qloo beat the popularity list on real tour picks", miss: "Qloo did not beat the popularity list on real tour picks" },
  { id: "B_post_cutoff", lead: "Again on cases after the model's cutoff", miss: "Qloo did not beat the popularity list on cases after the model's cutoff" },
] as const;

const isPrimary = (s: ProofSignLine): boolean => !/secondary|exploratory|\+ Qloo/i.test(s.label);
const llmLine = (t: ProofV3Test): ProofSignLine | undefined => t.signTests.find((s) => isPrimary(s) && /gemini|llm/i.test(s.label));
const popLine = (t: ProofV3Test): ProofSignLine | undefined => t.signTests.find((s) => isPrimary(s) && /popularity/i.test(s.label));

/** Everything here is computed from the published sign tests and checker counts; no number is typed in. */
export function buildScoreboard(v3: ProofV3): Scoreboard {
  const byId = new Map(v3.tests.map((t) => [t.id, t] as const));
  const out: Scoreboard = { qloo: [], llm: [], even: [], notWins: [] };
  for (const cfg of POPULARITY_TESTS) {
    const s = byId.get(cfg.id) ? popLine(byId.get(cfg.id)!) : undefined;
    if (!s || s.pairs === 0) continue;
    const counts = `${plural(s.wins, "win", "wins")}, ${plural(s.losses, "loss", "losses")}, ${pText(s.p)}`;
    if (s.wins > s.losses) out.qloo.push({ anchor: anchorOf(cfg.id), text: `${cfg.lead}: ${counts}${s.p < 0.05 ? "" : " (not significant)"}.` });
    else out.notWins.push({ anchor: anchorOf(cfg.id), text: `${cfg.miss}: ${counts}.` });
  }
  for (const cfg of LLM_TESTS) {
    const t = byId.get(cfg.id);
    const s = t ? llmLine(t) : undefined;
    if (!s || s.pairs === 0) continue;
    const entry = (ahead: string, aheadN: number, other: string, otherN: number): ScoreEntry => ({
      anchor: anchorOf(cfg.id),
      text: `${cfg.name}: ${ahead} was ahead on ${aheadN} of ${s.pairs} ${cfg.unit}, ${other} on ${otherN} (${plural(s.ties, "tie", "ties")}), ${sig(s.p)}.`,
    });
    if (s.losses > s.wins) out.llm.push(entry(cfg.who, s.losses, cfg.us, s.wins));
    else if (s.wins > s.losses) out.qloo.push(entry(cfg.us, s.wins, cfg.who, s.losses));
    else out.even.push({ anchor: anchorOf(cfg.id), text: `${cfg.name}: level, ${s.wins} each (${plural(s.ties, "tie", "ties")}), ${sig(s.p)}.` });
  }
  const rows = v3.checkers?.rows ?? [];
  const planted = rows.reduce((a, r) => a + r.planted, 0);
  if (planted > 0) {
    const caught = rows.reduce((a, r) => a + r.caught, 0), fa = rows.reduce((a, r) => a + r.falseAlarms, 0);
    out.qloo.push({ anchor: "proof-checkers", text: `The product's checkers caught ${caught} of ${planted} planted errors, with ${plural(fa, "false alarm", "false alarms")}.` });
  }
  return out;
}

const SIDES = "Qloo rank|Qloo|winnability|Qloo's playbook";
const DETAIL = [
  / was excluded \(/,
  / was dropped \(/,
  /was re-anchored to/,
  /^Board mostly played for /,
  new RegExp(`^(Gemini|Popularity|Fan heat|The generic LLM|Population|The LLM-only playbook) beat (${SIDES}) (for|in) [^():;]+\\.$`),
];
/** Headline claims stay in the list; the one-line-per-case ones (raw slugs, exclusions, re-anchors) go behind a disclosure. */
export function splitClaims(claims: string[]): { headline: string[]; detail: string[] } {
  const headline: string[] = [], detail: string[] = [];
  for (const c of claims) (DETAIL.some((r) => r.test(c)) ? detail : headline).push(c);
  return { headline, detail };
}
