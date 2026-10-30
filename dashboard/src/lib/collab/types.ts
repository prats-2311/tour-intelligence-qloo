// Mirrors cloud_run/qloo_gateway/src/collab/model.ts (the API contract); keep the two in step.
export const ROLES = ["Manager", "Booking agent", "Promoter", "Brand team", "Other"] as const;
export type Role = (typeof ROLES)[number];
export const STATUSES = ["considering", "confirmed", "on_hold", "dropped"] as const;
export type CityStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<CityStatus, string> = { considering: "Considering", confirmed: "Confirmed", on_hold: "On hold", dropped: "Dropped" };
export const FIELDS = ["top_zone", "best_room", "support"] as const;
export type Field = (typeof FIELDS)[number];
/** The hero tile (by its label, any case) a team value can replace. */
export const fieldOf = (label: string): Field | undefined => ({ "top zone": "top_zone", "best room": "best_room", support: "support" } as Record<string, Field>)[label.toLowerCase()];
export const FIELD_LABEL: Record<Field, string> = { top_zone: "Top zone", best_room: "Best room", support: "Support" };

export const LIMITS = { text: 1000, name: 40, value: 120, reason: 200, lead: 200, pollMs: 10_000 } as const;
export const DEMO_BANNER = "Demo discussion between fictional teammates, seeded so you can see collaboration. Add your own note. Only you can see this copy.";
export const SHARE_NOTICE = "Anyone with this link can see and add notes. Don't post contracts, fees or personal details.";

export interface Actor { name: string; role: Role }
export interface Message extends Actor { id: string; text: string; at: number; demo?: true }
export interface Thread { resolved: boolean; resolvedBy?: Actor; resolvedAt?: number; messages: Message[] }
export interface StatusEntry extends Actor { status: CityStatus; at: number; demo?: true }
export interface OverrideEntry extends Actor { value: string; original: string; reason?: string; at: number; demo?: true }
export interface Lead extends Actor { id: string; text: string; at: number; demo?: true }
export type ActivityType = "status" | "message" | "resolve" | "reopen" | "override" | "override_clear" | "lead" | "lead_remove";
export interface ActivityEvent extends Actor { id: string; type: ActivityType; cityId?: string; key?: string; text?: string; at: number; demo?: true }
export interface Snapshot {
  ws: string; rev: number; createdAt: number;
  statuses: Record<string, StatusEntry>;
  threads: Record<string, Thread>;
  overrides: Record<string, Partial<Record<Field, OverrideEntry>>>;
  leads: Record<string, Lead[]>;
  /** Newest first. */
  activity: ActivityEvent[];
}
export type Op = "status" | "message" | "resolve" | "override" | "override_clear" | "lead" | "lead_remove";
export const OP_PATH: Record<Op, string> = { status: "status", message: "message", resolve: "resolve", override: "override", override_clear: "override/clear", lead: "lead", lead_remove: "lead/remove" };

export const WS_ID = /^[A-Za-z0-9_-]{10,64}$/;
export const cityThread = (cityId: string): string => `city:${cityId}`;
export const cardThread = (cityId: string, kind: string): string => `card:${cityId}:${kind}`;
export const emptySnapshot = (ws: string): Snapshot => ({ ws, rev: 0, createdAt: Date.now(), statuses: {}, threads: {}, overrides: {}, leads: {}, activity: [] });

export function isSnapshot(v: unknown): v is Snapshot {
  const o = v as Snapshot | null;
  return !!o && typeof o === "object" && typeof o.ws === "string" && typeof o.rev === "number" && !!o.statuses && !!o.threads && !!o.overrides && !!o.leads && Array.isArray(o.activity);
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
