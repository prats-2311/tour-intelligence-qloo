export const INSIGHTS_TYPES = ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show", "videogame"] as const;
export const SEARCH_TYPES = [...INSIGHTS_TYPES, "locality", "actor", "album", "author", "director"] as const;

export const TOOL_ALLOWLIST = [
  "qloo_capabilities", "qloo_describe", "qloo_where_popular", "qloo_audience_demographics", "qloo_entity_tags",
  "qloo_trends", "qloo_recommend", "qloo_rank", "qloo_compare_audiences", "qloo_find_tags",
] as const;
export type ToolName = (typeof TOOL_ALLOWLIST)[number];

type Rule =
  | { kind: "string"; required?: boolean }
  | { kind: "bool" }
  | { kind: "limit" }
  | { kind: "date"; required?: boolean }
  | { kind: "enum"; values: readonly string[]; required?: boolean }
  | { kind: "strings"; min: number; max: number; required?: boolean };

const ENTITY_LIST: Rule = { kind: "strings", min: 1, max: 10 };
const OP: Rule = { kind: "enum", values: ["union", "intersection"] };

const RULES: Record<ToolName, Record<string, Rule>> = {
  qloo_capabilities: { operation_ids: { kind: "strings", min: 0, max: 20 } },
  qloo_describe: { entity: { kind: "string", required: true }, type: { kind: "enum", values: SEARCH_TYPES } },
  qloo_where_popular: {
    entity: { kind: "string", required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES },
    within: { kind: "string", required: true }, limit: { kind: "limit" },
  },
  qloo_audience_demographics: { entity: { kind: "string", required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES }, limit: { kind: "limit" } },
  qloo_entity_tags: { entities: { ...ENTITY_LIST, required: true }, entity_type: { kind: "enum", values: SEARCH_TYPES }, limit: { kind: "limit" } },
  qloo_trends: {
    entities: { kind: "strings", min: 1, max: 5, required: true }, entity_type: { kind: "enum", values: INSIGHTS_TYPES, required: true },
    start_date: { kind: "date", required: true }, end_date: { kind: "date", required: true }, limit: { kind: "limit" },
  },
  qloo_recommend: {
    target_type: { kind: "enum", values: INSIGHTS_TYPES, required: true }, signals: ENTITY_LIST, signal_tags: ENTITY_LIST,
    signal_tags_operator: OP, signal_location: { kind: "string" }, demographic: { kind: "string" }, filter_location: { kind: "string" },
    include_tags: ENTITY_LIST, include_tags_operator: OP, exclude_tags: ENTITY_LIST, exclude_tags_operator: OP,
    explain: { kind: "bool" }, limit: { kind: "limit" },
  },
  qloo_rank: {
    options: { kind: "strings", min: 1, max: 10, required: true }, option_type: { kind: "enum", values: INSIGHTS_TYPES, required: true },
    signals: ENTITY_LIST, signal_location: { kind: "string" }, demographic: { kind: "string" }, include_tags: ENTITY_LIST, exclude_tags: ENTITY_LIST,
  },
  qloo_compare_audiences: {
    group_a: { ...ENTITY_LIST, required: true }, group_b: { ...ENTITY_LIST, required: true },
    target_type: { kind: "enum", values: INSIGHTS_TYPES }, limit: { kind: "limit" },
  },
  qloo_find_tags: { query: { kind: "string", required: true }, semantic: { kind: "bool" }, limit: { kind: "limit" } },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkRule(tool: string, key: string, rule: Rule, value: unknown): string | null {
  switch (rule.kind) {
    case "string":
      return typeof value === "string" && value.trim().length > 0 ? null : `${tool}: ${key} must be a non-empty string`;
    case "bool":
      return typeof value === "boolean" ? null : `${tool}: ${key} must be a boolean`;
    case "limit":
      return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20 ? null : `${tool}: limit must be an integer 1-20`;
    case "date":
      return typeof value === "string" && DATE.test(value) ? null : `${tool}: ${key} must be YYYY-MM-DD`;
    case "enum":
      return typeof value === "string" && rule.values.includes(value) ? null : `${tool}: ${key} must be one of ${rule.values.join(", ")}`;
    case "strings":
      if (!Array.isArray(value) || value.length < rule.min || value.length > rule.max) return `${tool}: ${key} must have ${rule.min}-${rule.max} items`;
      return value.every((v) => typeof v === "string" && v.trim().length > 0) ? null : `${tool}: ${key} items must be non-empty strings`;
  }
}

export function validateToolCall(name: string, args: unknown):
  | { ok: true; name: ToolName; args: Record<string, unknown> }
  | { ok: false; error: string } {
  if (!(TOOL_ALLOWLIST as readonly string[]).includes(name)) return { ok: false, error: `tool not allowlisted: ${name}` };
  const tool = name as ToolName;
  if (typeof args !== "object" || args === null || Array.isArray(args)) return { ok: false, error: `${tool}: arguments must be an object` };
  const record = args as Record<string, unknown>;
  const rules = RULES[tool];
  for (const key of Object.keys(record)) if (!Object.hasOwn(rules, key)) return { ok: false, error: `${tool}: unknown argument ${key}` };
  for (const [key, rule] of Object.entries(rules)) {
    const value = record[key];
    if (value === undefined) {
      if ("required" in rule && rule.required) return { ok: false, error: `${tool}: ${key} is required` };
      continue;
    }
    const problem = checkRule(tool, key, rule, value);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, name: tool, args: record };
}
