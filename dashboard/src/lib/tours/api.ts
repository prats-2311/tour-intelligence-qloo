import { sessionHeaders } from "@/lib/qloo/session";

/** Saved tours (times are epoch ms): the browser's side of the BFF contract (`/api/owners`, `/api/tours*`). The owner token is the only credential; it lives in localStorage. */
export const OWNER_KEY = "tiq.owner";
export const LIMIT_MESSAGE = "You have 50 saved tours; delete one to save more.";

export type ToursErrorKind = "disabled" | "limit" | "not_found" | "too_large" | "full" | "rate_limited" | "unauthorized" | "server" | "network";
export class ToursError extends Error {
  kind: ToursErrorKind;
  status: number;
  constructor(kind: ToursErrorKind, message: string, status = 0) { super(message); this.name = "ToursError"; this.kind = kind; this.status = status; }
}

export type TourStatus = "draft" | "final";
export interface TourSummaryCity { id: string; name: string; country: string; verdict?: string; score?: number | null }
export interface TourSummary { artist: string; regions?: string[]; cities: TourSummaryCity[] }
export interface TourListItem { id: string; title: string; status: TourStatus; artist: string; regions: string[]; cities: TourSummaryCity[]; createdAt: number; updatedAt: number; runBytes: number }
export interface SavedTour extends Partial<TourListItem> { id: string; run: unknown }
export interface SaveBody { title?: string; status?: TourStatus; summary: TourSummary; run: unknown }
export type PatchBody = Partial<SaveBody>;
type Opts = { fetchImpl?: typeof fetch; signal?: AbortSignal };

function readToken(): string | null {
  try { return localStorage.getItem(OWNER_KEY) || null; } catch { return null; }
}
function storeToken(t: string): boolean {
  try { localStorage.setItem(OWNER_KEY, t); return localStorage.getItem(OWNER_KEY) === t; } catch { return false; }
}
function dropToken(): void { try { localStorage.removeItem(OWNER_KEY); } catch { /* storage blocked */ } }

/** True once this browser holds an owner token (nothing has been saved before that, so there is nothing to list). */
export const hasOwnerToken = (): boolean => readToken() !== null;

/** True when this browser can keep the owner token (false in some private windows): saved tours are then off. */
export function savedToursAvailable(): boolean {
  try { const k = "tiq.probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch { return false; }
}

let creating: Promise<string> | null = null;
/** The stored token, or a new one from `POST /api/owners` (created on the first call that needs it, then reused). */
export async function ensureOwner(opts: Opts = {}): Promise<string> {
  const have = readToken();
  if (have) return have;
  if (!savedToursAvailable()) throw new ToursError("disabled", "Saved tours need this browser to keep site data.");
  if (!creating) {
    creating = (async () => {
      let res: Response;
      try { res = await (opts.fetchImpl ?? fetch)("/api/owners", { method: "POST", signal: opts.signal, headers: sessionHeaders() }); }
      catch { throw new ToursError("network", "Couldn't reach the server."); }
      if (res.status === 429) throw new ToursError("rate_limited", "Too many saves just now. Try again in a little while.", 429);
      if (!res.ok) throw new ToursError("server", "Couldn't set up saved tours.", res.status);
      const j = (await res.json().catch(() => ({}))) as { ownerToken?: unknown };
      if (typeof j.ownerToken !== "string" || !j.ownerToken) throw new ToursError("server", "Couldn't set up saved tours.", res.status);
      if (!storeToken(j.ownerToken)) throw new ToursError("disabled", "Saved tours need this browser to keep site data.");
      return j.ownerToken;
    })().finally(() => { creating = null; });
  }
  return creating;
}

async function send(path: string, init: { method?: string; body?: unknown }, opts: Opts, token: string): Promise<Response> {
  const headers: Record<string, string> = { ...sessionHeaders(), "x-tiq-owner": token, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) };
  try {
    return await (opts.fetchImpl ?? fetch)(path, { method: init.method ?? "GET", signal: opts.signal, headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ToursError("network", "Couldn't reach the server.");
  }
}

/** True only for the gateway's own `401 {error:"owner required"}`; any other 401/403 (IAM, proxies) must not cost the user their token. */
async function isOwnerRequired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const j = (await res.clone().json().catch(() => null)) as { error?: unknown } | null;
  return j?.error === "owner required";
}

async function request(path: string, init: { method?: string; body?: unknown }, opts: Opts): Promise<Response> {
  let res = await send(path, init, opts, await ensureOwner(opts));
  if (await isOwnerRequired(res)) {
    // The server no longer knows this token: drop it, make a new one, and try once more.
    dropToken();
    res = await send(path, init, opts, await ensureOwner(opts));
  }
  if (res.ok) return res;
  if (await isOwnerRequired(res)) throw new ToursError("unauthorized", "Saved tours are unavailable in this browser.", 401);
  if (res.status === 404 || res.status === 410) throw new ToursError("not_found", "That saved tour no longer exists.", res.status);
  if (res.status === 409) throw new ToursError("limit", LIMIT_MESSAGE, 409);
  if (res.status === 429) throw new ToursError("rate_limited", "Too many saves just now. Try again in a little while.", 429);
  if (res.status === 413 && (await res.clone().json().catch(() => null))?.error?.startsWith?.("saved tours are full")) throw new ToursError("full", "Your saved tours are full. Delete some to save more.", 413);
  if (res.status === 413) throw new ToursError("too_large", "This tour is too large to save.", 413);
  throw new ToursError("server", "Saved tours are unavailable right now. Try again in a moment.", res.status);
}

export async function saveTour(body: SaveBody, opts: Opts = {}): Promise<{ id: string; updatedAt: number }> {
  return (await (await request("/api/tours", { method: "POST", body }, opts)).json()) as { id: string; updatedAt: number };
}
export async function patchTour(id: string, body: PatchBody, opts: Opts = {}): Promise<{ id: string; updatedAt: number }> {
  return (await (await request(`/api/tours/${encodeURIComponent(id)}`, { method: "PATCH", body }, opts)).json()) as { id: string; updatedAt: number };
}
export async function listTours({ q = "", status = "all" }: { q?: string; status?: "all" | TourStatus }, opts: Opts = {}): Promise<TourListItem[]> {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (status !== "all") p.set("status", status);
  const qs = p.toString();
  const j = (await (await request(`/api/tours${qs ? `?${qs}` : ""}`, {}, opts)).json()) as { tours?: TourListItem[] };
  return Array.isArray(j.tours) ? j.tours : [];
}
export async function getTour(id: string, opts: Opts = {}): Promise<SavedTour> {
  return (await (await request(`/api/tours/${encodeURIComponent(id)}`, {}, opts)).json()) as SavedTour;
}
export async function deleteTour(id: string, opts: Opts = {}): Promise<void> {
  await request(`/api/tours/${encodeURIComponent(id)}`, { method: "DELETE" }, opts);
}
