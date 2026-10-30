import type { BqRow } from "./bigquery.js";
import type { Field, Op, WorkspaceDoc } from "../collab/model.js";

type CityOf = (id: string) => { name: string; country: string } | undefined;
const EVENT: Record<Op, string> = { status: "status", message: "message", resolve: "resolve", override: "override", override_clear: "override_clear", lead: "lead", lead_remove: "lead_remove" };

/** City id and card kind from a validated thread key: `city:<id>` or `card:<id>:<kind>`; `tour:*` has neither. */
function fromKey(key: unknown): { city: string | null; kind: string | null } {
  if (typeof key !== "string") return { city: null, kind: null };
  const parts = key.split(":");
  if (parts[0] === "city" && parts[1]) return { city: parts[1], kind: null };
  if (parts[0] === "card" && parts[1]) return { city: parts[1], kind: parts[2] ?? null };
  return { city: null, kind: null };
}

/**
 * The analytics row for one applied write: event type, city, card kind, role, status, override field. No note text, no lead text, no names.
 * `doc` is the document after the write. Re-opening a thread is not logged (the event list has no such type).
 */
export function teamEventRow(op: Op, body: Record<string, unknown>, doc: WorkspaceDoc, cityOf?: CityOf): BqRow | null {
  if (op === "resolve" && body.resolved !== true) return null;
  const key = fromKey(body.key);
  const cityId = typeof body.cityId === "string" ? body.cityId : key.city;
  const city = cityId ? cityOf?.(cityId) : undefined;
  const field = op === "override" || op === "override_clear" ? (body.field as Field) : null;
  return {
    event: EVENT[op], city_id: cityId, city: city?.name ?? null, country: city?.country ?? null, card_kind: key.kind,
    role: typeof body.role === "string" ? body.role : null,
    status_to: op === "status" && typeof body.status === "string" ? body.status : null,
    override_field: field,
    // Qloo's own suggestion is on record as the override's `original`: true when the team replaced one.
    overrode_qloo: op === "override" && cityId && field ? (doc.overrides[cityId]?.[field]?.original ?? "") !== "" : null,
  };
}
