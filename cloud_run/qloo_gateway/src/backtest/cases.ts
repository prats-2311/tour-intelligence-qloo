// cloud_run/qloo_gateway/src/backtest/cases.ts
/** Backtest cases are evidence: every one is human-reviewed before it can be scored (spec §3 ⑤). */
export type ActivationType = "sponsor" | "merch_collab" | "local_artist";
export const ACTIVATION_TYPES: readonly ActivationType[] = ["sponsor", "merch_collab", "local_artist"];
export const MIN_CASES = 8;

export interface BacktestCase {
  id: string;
  artist: string;
  city: string;
  country: string;
  activationType: ActivationType;
  realEntity: { name: string; aliases?: string[] };
  date: string;
  sources: string[];
  summary: string;
  review: { status: "accepted"; by: string; at: string; note?: string };
}

const ID = /^[a-z0-9-]{3,64}$/;
const DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;

function httpsUrl(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}

function dateOk(v: unknown): boolean {
  const m = typeof v === "string" ? DATE.exec(v) : null;
  if (!m) return false;
  const year = Number(m[1]); const month = Number(m[2]);
  return year >= 2021 && year <= 2026 && month >= 1 && month <= 12;
}

export function validateCases(raw: unknown): { cases: BacktestCase[]; skipped: number; errors: string[] } {
  if (!Array.isArray(raw)) return { cases: [], skipped: 0, errors: ["cases file must be a JSON array"] };
  const cases: BacktestCase[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  raw.forEach((item, i) => {
    const c = (item ?? {}) as Record<string, unknown>;
    const where = `case ${i} (${typeof c.id === "string" ? c.id : "?"})`;
    const problems: string[] = [];
    if (typeof c.id !== "string" || !ID.test(c.id)) problems.push("id must match [a-z0-9-]{3,64}");
    else if (seen.has(c.id)) problems.push("duplicate id");
    for (const k of ["artist", "city", "country"] as const) if (!isText(c[k], 100)) problems.push(`${k} must be 1-100 chars`);
    if (!ACTIVATION_TYPES.includes(c.activationType as ActivationType)) problems.push("activationType must be sponsor | merch_collab | local_artist");
    const re = (c.realEntity ?? {}) as Record<string, unknown>;
    if (!isText(re.name, 120)) problems.push("realEntity.name must be 1-120 chars");
    if (re.aliases !== undefined && (!Array.isArray(re.aliases) || re.aliases.length > 5 || !re.aliases.every((a) => isText(a, 120)))) problems.push("realEntity.aliases must be up to 5 names");
    if (!dateOk(c.date)) problems.push("date must be YYYY-MM or YYYY-MM-DD between 2021 and 2026");
    if (!Array.isArray(c.sources) || c.sources.length < 1 || c.sources.length > 4 || !c.sources.every(httpsUrl)) problems.push("sources must be 1-4 https URLs");
    if (!isText(c.summary, 280)) problems.push("summary must be 1-280 chars");
    const rv = (c.review ?? {}) as Record<string, unknown>;
    if (rv.status === "pending" || rv.status === "rejected") { skipped += 1; return; }
    if (rv.status !== "accepted" || !isText(rv.by, 60) || !/^\d{4}-\d{2}-\d{2}$/.test(String(rv.at))) problems.push("review must be accepted with by and at (YYYY-MM-DD)");
    if (problems.length) { errors.push(`${where}: ${problems.join("; ")}`); return; }
    seen.add(c.id as string);
    cases.push(c as unknown as BacktestCase);
  });
  return { cases, skipped, errors };
}
