/**
 * Organisations that are not sponsors: non-profits, advocacy, political and religious bodies.
 * Qloo brand entities carry no tag or property that identifies these (only name, subtype "brand", popularity, affinity and a description),
 * so this is a disclosed, curated name list plus simple name patterns, like the dashboard's do-not-book list.
 * The dashboard keeps an identical copy in dashboard/src/lib/qloo/nonSponsors.ts; test/nonSponsors.test.ts pins the two equal.
 */
export const NON_SPONSOR_NAMES: readonly string[] = [
  "Planned Parenthood", "ACLU", "American Civil Liberties Union", "Black Lives Matter", "Greenpeace", "Sierra Club", "Amnesty International",
  "Southern Poverty Law Center", "NAACP", "Human Rights Campaign", "Democratic Party", "Republican Party", "Democratic Socialists of America",
  "NRA", "National Rifle Association", "UNICEF", "Red Cross", "ASPCA", "Doctors Without Borders", "Planned Parenthood Action Fund", "MoveOn",
  "Sunrise Movement", "The Trevor Project", "Feeding America", "Habitat for Humanity", "St. Jude", "Salvation Army",
];
/** Generic endings that mark an organisation rather than a brand (matched at the end of a folded name). */
export const NON_SPONSOR_ENDINGS: readonly string[] = [" Foundation", " Party", " Church"];

export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAMES = NON_SPONSOR_NAMES.map(fold);
const ENDINGS = NON_SPONSOR_ENDINGS.map(fold);
// A listed name as whole words anywhere in the text ("Planned Parenthood Federation of America" matches; "Unicorn" does not match "UNICEF").
const NAME_RES = NAMES.map((n) => new RegExp(`(^|[^a-z0-9])${esc(n)}($|[^a-z0-9])`));

/** True when a brand name is a listed organisation (whole-word, case and accent folded) or ends in a generic organisation ending. */
export const isNonSponsor = (name: unknown): boolean => {
  if (typeof name !== "string") return false;
  const t = fold(name);
  return t !== "" && (NAME_RES.some((re) => re.test(t)) || ENDINGS.some((e) => t.endsWith(e)));
};

/** True when free text names a listed organisation (curated names only; endings are too loose for prose). */
export const mentionsNonSponsor = (text: string): boolean => { const t = fold(text); return NAME_RES.some((re) => re.test(t)); };

/** The items without non-sponsors, and how many were removed. */
export function dropNonSponsors<T extends { name: string }>(items: T[]): { items: T[]; hidden: number } {
  const kept = items.filter((it) => !isNonSponsor(it.name));
  return { items: kept, hidden: items.length - kept.length };
}
