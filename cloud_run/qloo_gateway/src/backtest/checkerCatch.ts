import { unsupportedNumbers } from "../strategist/answerCheck.js";
import { dropNonSponsors } from "../pipeline/nonSponsors.js";
import { keepVerified, type SponsorVerdicts } from "../pipeline/sponsorCheck.js";
import { verifyAdvance } from "../web/advance.js";
import type { UserDocument, WebResult } from "../types.js";

/**
 * Catch rates for the product's other checkers (docs/qloo/proof-v3-protocol.md, Amendment 10): 20 planted errors and 20 clean controls each,
 * from fixed generators (an index and a formula, no randomness). Offline: no Qloo, no Gemini, no network.
 */
export interface CheckerCase { id: string; group: string; text: string; planted: boolean; flagged: boolean }
export interface CheckerScore { planted: number; caught: number; controls: number; falseAlarms: number }
export interface GroupScore { group: string; planted: boolean; total: number; flagged: number }
export type CheckerId = "answer" | "document" | "advance" | "sponsor";
export interface CheckerSection extends CheckerScore { id: CheckerId; checker: string; guards: string; groups: GroupScore[]; cases: CheckerCase[] }
export interface CheckersResult {
  checkers: CheckerSection[];
  /** The sponsor lists again with the classifier call failed (`available = false`): what the name rule alone catches. */
  sponsorNameRuleOnly: CheckerSection;
}

export function scoreCases(cases: CheckerCase[]): CheckerScore {
  const planted = cases.filter((c) => c.planted), controls = cases.filter((c) => !c.planted);
  return { planted: planted.length, caught: planted.filter((c) => c.flagged).length, controls: controls.length, falseAlarms: controls.filter((c) => c.flagged).length };
}

const range = (n: number, from = 0): number[] => Array.from({ length: n }, (_, i) => from + i);
const f2 = (v: number): string => v.toFixed(2);
const r2 = (v: number): number => Math.round(v * 100) / 100;
const thousands = (n: number): string => n.toLocaleString("en-US");
type Raw = { id: string; group: string; text: string; planted: boolean };

// ---- 10.a Strategist answer check ----
const lonOf = (k: number): number => r2(-(70 + 3.17 * k));
const ageOf = (k: number): number => r2(-(0.1 + 0.01 * k));
const ANSWER_TOOL_DATA: unknown[] = [[
  ...range(20).map((k) => ({ audience: 1000 + 53 * k })),
  ...range(20).map((k) => ({ lon: lonOf(k) })),
  ...range(20).map((k) => ({ sharedTaste: r2(0.5 + 0.01 * k) })),
  ...range(20).map((k) => ({ share: r2(0.3 + 0.01 * k) })),
  ...range(20).map((k) => ({ query: { age: { band: ageOf(k) } } })),
]];

function answerRaw(): Raw[] {
  const out: Raw[] = [];
  const add = (group: string, planted: boolean, i: number, text: string) => out.push({ id: `a-${planted ? "p" : "c"}-${group}-${i}`, group, text, planted });
  for (const k of range(8)) add("absent", true, k, `Attendance reached ${thousands(1007 + 53 * k)}.`);
  for (const k of range(4)) add("absent_abs", true, k, `The venue sits near ${f2(Math.abs(lonOf(k)) + 5.11)} west.`);
  for (const k of range(4)) add("wrong_sign", true, k, `The age band indexes at +${f2(Math.abs(ageOf(k)))} above average.`);
  for (const k of range(4, 4)) add("percent_index", true, k, `About ${Math.round(100 * Math.abs(ageOf(k)))}% of the audience is in that band.`);
  for (const k of range(8)) add("present", false, k, `Attendance reached ${thousands(1000 + 53 * k)}.`);
  for (const k of range(6)) add("sign_dropped", false, k, `The venue sits near ${f2(Math.abs(lonOf(k)))} west.`);
  for (const k of range(3)) add("score_plain", false, k, `Shared taste is ${f2(0.5 + 0.01 * k)}.`);
  for (const k of range(3)) add("percent_non_score", false, k, `${Math.round(100 * (0.3 + 0.01 * k))}% of ticket buyers used the presale.`);
  return out;
}
export function answerCases(): CheckerCase[] {
  return answerRaw().map((c) => ({ ...c, flagged: unsupportedNumbers(c.text, ANSWER_TOOL_DATA, {}).length > 0 }));
}

// ---- 10.b Document citation check ----
const DOCS: UserDocument[] = [{ id: "rec", name: "recap.txt", pages: range(10, 1).map((n) => ({ n, text: `Show ${n} sold ${300 + 41 * n} tickets. Gross was ${thousands(5000 + 730 * n)}.` })) }];
const DOC_TOOL_DATA: unknown[] = [range(6).map((k) => ({ fit: 7000 + 113 * k }))];

function documentRaw(): Raw[] {
  const out: Raw[] = [];
  const add = (group: string, planted: boolean, i: number, text: string) => out.push({ id: `d-${planted ? "p" : "c"}-${group}-${i}`, group, text, planted });
  for (const k of range(7, 1)) add("absent_page", true, k, `That date drew ${300 + 41 * k + 9} tickets [doc:rec p.${k}].`);
  for (const m of range(7, 1)) add("wrong_page", true, m, `That date drew ${300 + 41 * m} tickets [doc:rec p.${m + 1}].`);
  for (const k of range(6)) add("tool_only", true, k, `The fit was ${thousands(7000 + 113 * k)} [doc:rec p.1].`);
  for (const n of range(10, 1)) add("tickets", false, n, `That date drew ${300 + 41 * n} tickets [doc:rec p.${n}].`);
  for (const n of range(10, 1)) add("gross", false, n, `Gross was ${thousands(5000 + 730 * n)} [doc:rec p.${n}].`);
  return out;
}
export function documentCases(): CheckerCase[] {
  return documentRaw().map((c) => ({ ...c, flagged: unsupportedNumbers(c.text, DOC_TOOL_DATA, {}, DOCS).length > 0 }));
}

// ---- 10.c Advance source and number filter ----
const DESTS = [{ code: "US", name: "United States" }, { code: "MX", name: "Mexico" }, { code: "BR", name: "Brazil" }] as const;
const destOf = (i: number) => DESTS[i % 3]!;
const cleanSource = (i: number): WebResult => ({
  title: `${destOf(i).name} work visa processing for touring musicians`, url: `https://example.test/${destOf(i).code.toLowerCase()}/${i}`,
  content: `Processing takes ${10 + 3 * i} business days and the fee is ${150 + 25 * i} dollars in ${destOf(i).name}.`,
} as WebResult);
const companion = (i: number): number => (i + 3 < 20 ? i + 3 : i - 3);

const OTHER: Array<{ dest: 0 | 1 | 2; title: string; slug: string; content: string }> = [
  { dest: 0, title: "Canada work permits for visiting musicians", slug: "ca/work-permits", content: "Foreign performers in Canada may need a work permit; the fee is 155 dollars and processing takes 14 days." },
  { dest: 0, title: "UK Permitted Paid Engagement for touring artists", slug: "uk/ppe", content: "Visitors to the UK can perform for up to 30 days with a Permitted Paid Engagement." },
  { dest: 1, title: "Spain visa for non-EU musicians", slug: "es/visa", content: "Artists entering Spain apply at the consulate and processing takes 21 days." },
  { dest: 1, title: "France ATA Carnet customs for instruments", slug: "fr/carnet", content: "Customs in France accept an ATA Carnet valid for 12 months." },
  { dest: 2, title: "Portugal visa for performing artists", slug: "pt/visa", content: "Portugal issues a temporary stay visa for artists with a fee of 90 euros." },
  { dest: 0, title: "Japan entry rules for foreign bands", slug: "jp/bands", content: "Japan requires a Certificate of Eligibility and processing takes 30 days. Unlike the United States, there is no O-1 category." },
  { dest: 0, title: "Germany artist visa guide", slug: "de/artists", content: "Germany's freelance visa takes 40 days. It differs from the United States P-1 visa." },
  { dest: 1, title: "Colombia customs rules for instruments", slug: "co/customs", content: "Colombia accepts an ATA Carnet for 6 months. Mexico also accepts it." },
  { dest: 2, title: "Argentina touring visa", slug: "ar/visa", content: "Argentina grants a touring visa in 25 days. Brazil requires a different visa." },
  { dest: 2, title: "Chile work visa for artists", slug: "cl/visa", content: "Chile processes artist visas in 20 days. Brazil takes 45 days." },
];

interface AdvanceRaw extends Raw { dest: number; results: WebResult[]; sourceUrl: string }
function advanceRaw(): AdvanceRaw[] {
  const out: AdvanceRaw[] = [];
  const add = (group: string, planted: boolean, i: number, text: string, dest: number, source: WebResult, results: WebResult[]) =>
    out.push({ id: `c-${planted ? "p" : "c"}-${group}-${i}`, group, text, planted, dest, results, sourceUrl: source.url });
  OTHER.forEach((o, i) => {
    const src = { title: o.title, url: `https://example.test/${o.slug}`, content: o.content } as WebResult;
    add("other_country", true, i, o.content.split(/(?<=\.)\s/)[0]!, o.dest, src, [src, cleanSource(o.dest)]);
  });
  for (const i of range(5)) add("number_absent", true, i, `The fee is ${150 + 25 * i + 4} dollars.`, i % 3, cleanSource(i), [cleanSource(i), cleanSource(companion(i))]);
  for (const i of range(5, 5)) add("number_other_source", true, i, `Allow ${10 + 3 * (i + 1)} business days.`, i % 3, cleanSource(i), [cleanSource(i), cleanSource(companion(i))]);
  for (const i of range(20)) add("correct", false, i, `Allow ${10 + 3 * i} business days and a fee of ${150 + 25 * i} dollars.`, i % 3, cleanSource(i), [cleanSource(i), cleanSource(companion(i))]);
  return out;
}
export function advanceCases(): CheckerCase[] {
  return advanceRaw().map(({ dest, results, sourceUrl, ...c }) => {
    const r = verifyAdvance({ items: [{ text: c.text, sourceUrl }] }, results, DESTS[dest]!.name);
    return { ...c, flagged: r.items.length === 0 };
  });
}

// ---- 10.d Sponsor check ----
const PLANTS = [
  "Planned Parenthood", "ACLU", "Greenpeace", "Sierra Club", "NAACP", "Red Cross", "Feeding America", "Salvation Army",
  "Robin Hood Foundation", "Wikimedia Foundation", "Libertarian Party", "Hillsong Church",
  "Everytown for Gun Safety", "Focus on the Family", "Oxfam", "Americans for Prosperity", "Mercy Corps", "Charity: Water", "Heritage Action", "Moms Demand Action",
];
const CONTROLS = [
  "Nike", "Coca-Cola", "Spotify", "Red Bull", "Adidas", "Samsung", "Levi's", "Pepsi", "Toyota", "Heineken",
  "Jack Daniel's", "Ticketmaster", "Uber", "Airbnb", "Sony", "Converse", "Absolut Vodka", "Doritos", "Fender", "Budweiser",
];
const pad = (n: number): string => String(n).padStart(2, "0");
/** Fixed fake classifier answers (sponsor verdict) by 1-based index; an index not listed has no answer. */
const PLANT_NO = new Set([1, 2, 4, 5, 6, 7, 8, 9, 13, 14, 15, 16]);
const PLANT_YES = new Set([3, 10, 11, 12, 19, 20]);
const CONTROL_NO = new Set([10, 12]);
const CONTROL_MISSING = new Set([18]);
const verdictsFor = (): Map<string, boolean> => {
  const m = new Map<string, boolean>();
  PLANTS.forEach((_, i) => { if (PLANT_NO.has(i + 1)) m.set(`p${pad(i + 1)}`, false); else if (PLANT_YES.has(i + 1)) m.set(`p${pad(i + 1)}`, true); });
  CONTROLS.forEach((_, i) => { if (CONTROL_NO.has(i + 1)) m.set(`c${pad(i + 1)}`, false); else if (!CONTROL_MISSING.has(i + 1)) m.set(`c${pad(i + 1)}`, true); });
  return m;
};
interface Item { entityId: string; name: string }
export interface SponsorList { items: Item[] }
const GROUPS_OF = (i: number): string => (i < 8 ? "name_list" : i < 12 ? "name_ending" : i < 16 ? "classifier_no" : i < 18 ? "classifier_missing" : "classifier_wrong_yes");

function sponsorLists(): SponsorList[] {
  return range(4).map((j) => ({
    items: range(5).flatMap((s) => [{ entityId: `c${pad(5 * j + s + 1)}`, name: CONTROLS[5 * j + s]! }, { entityId: `p${pad(5 * j + s + 1)}`, name: PLANTS[5 * j + s]! }]),
  }));
}
function runSponsor(available: boolean): CheckerCase[] {
  const verdicts: SponsorVerdicts = { available, verdicts: available ? verdictsFor() : new Map() };
  const kept = new Set<string>();
  for (const l of sponsorLists()) for (const it of keepVerified(dropNonSponsors(l.items).items, verdicts)) kept.add(it.entityId);
  return [
    ...PLANTS.map((name, i) => ({ id: `p${pad(i + 1)}`, group: GROUPS_OF(i), text: name, planted: true, flagged: !kept.has(`p${pad(i + 1)}`) })),
    ...CONTROLS.map((name, i) => ({ id: `c${pad(i + 1)}`, group: "brand", text: name, planted: false, flagged: !kept.has(`c${pad(i + 1)}`) })),
  ];
}
export function sponsorCases(): { main: CheckerCase[]; lists: SponsorList[] } {
  return { main: runSponsor(true), lists: sponsorLists() };
}

// ---- assembly ----
function section(id: CheckerId, checker: string, guards: string, cases: CheckerCase[]): CheckerSection {
  const groups: GroupScore[] = [];
  for (const c of cases) {
    let g = groups.find((x) => x.group === c.group && x.planted === c.planted);
    if (!g) { g = { group: c.group, planted: c.planted, total: 0, flagged: 0 }; groups.push(g); }
    g.total += 1; if (c.flagged) g.flagged += 1;
  }
  return { id, checker, guards, ...scoreCases(cases), groups, cases };
}

export function runCheckers(): CheckersResult {
  return {
    checkers: [
      section("answer", "Strategist answer check", "Numbers in the strategist's answers that appear in no tool result", answerCases()),
      section("document", "Document citation check", "Numbers cited to a page of your document that do not appear on that page", documentCases()),
      section("advance", "Advance source and number filter", "Visa and customs notes from another country's pages, or with numbers not in their source", advanceCases()),
      section("sponsor", "Sponsor check", "Non-profits, advocacy, political and religious groups listed as sponsors", sponsorCases().main),
    ],
    sponsorNameRuleOnly: section("sponsor", "Sponsor check, classifier unavailable", "The name rule alone, when the classifier call fails", runSponsor(false)),
  };
}
