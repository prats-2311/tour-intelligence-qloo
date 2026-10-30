import { sessionHeaders } from "../qloo/session";
import { isSnapshot, OP_PATH, WS_ID, type Op, type Snapshot } from "./types";

export class CollabHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
type Opts = { fetchImpl?: typeof fetch; signal?: AbortSignal };
const headers = () => ({ "content-type": "application/json", ...sessionHeaders() });

async function parse(res: Response): Promise<unknown> {
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new CollabHttpError(res.status, (json as { error?: string } | null)?.error ?? `request failed: ${res.status}`);
  return json;
}
const snapshotOf = (json: unknown): Snapshot => { if (!isSnapshot(json)) throw new CollabHttpError(502, "unexpected answer"); return json; };

/** Seed content for a fresh workspace (demo teammates); the server validates, caps and stamps it as demo. `agoMin` is minutes before now. */
export interface SeedActor { name: string; role: string; agoMin: number }
export interface Seed {
  statuses?: Array<SeedActor & { cityId: string; status: string }>;
  threads?: Array<{ key: string; resolved?: SeedActor; messages: Array<SeedActor & { text: string }> }>;
  overrides?: Array<SeedActor & { cityId: string; field: string; value: string; original: string; reason?: string }>;
  leads?: Array<SeedActor & { cityId: string; text: string }>;
}

export async function createWorkspace(seed?: Seed, opts: Opts = {}): Promise<Snapshot> {
  const res = await (opts.fetchImpl ?? fetch)("/api/qloo/ws", { method: "POST", signal: opts.signal, headers: headers(), body: JSON.stringify(seed ? { seed } : {}) });
  const json = (await parse(res)) as { ws?: unknown; snapshot?: unknown };
  const snap = snapshotOf(json?.snapshot);
  if (typeof json.ws !== "string" || !WS_ID.test(json.ws)) throw new CollabHttpError(502, "unexpected answer");
  return snap;
}

export async function fetchWorkspace(ws: string, opts: Opts = {}): Promise<Snapshot> {
  const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/ws/${ws}`, { signal: opts.signal, headers: { ...sessionHeaders() } });
  return snapshotOf(await parse(res));
}

export async function writeWorkspace(ws: string, op: Op, body: Record<string, unknown>, opts: Opts = {}): Promise<Snapshot> {
  const res = await (opts.fetchImpl ?? fetch)(`/api/qloo/ws/${ws}/${OP_PATH[op]}`, { method: "POST", signal: opts.signal, headers: headers(), body: JSON.stringify(body) });
  return snapshotOf(await parse(res));
}
