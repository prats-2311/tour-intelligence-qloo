import { TTL_DAYS, type WorkspaceDoc } from "./model.js";
import type { TxDb } from "../web/usage.js";

/**
 * Workspace storage. `update` runs `fn` on the latest doc atomically (a Firestore transaction), so concurrent writers
 * never lose each other's changes: last write wins per field. Returns null when the workspace does not exist or has expired.
 */
export interface CollabStore {
  get(ws: string): Promise<WorkspaceDoc | null>;
  create(ws: string, doc: WorkspaceDoc): Promise<boolean>;
  update(ws: string, fn: (doc: WorkspaceDoc) => WorkspaceDoc, now: number): Promise<WorkspaceDoc | null>;
}

const live = (d: WorkspaceDoc | undefined, now: number): d is WorkspaceDoc => !!d && d.expiresAt.getTime() > now;
const clone = (d: WorkspaceDoc): WorkspaceDoc => ({ ...structuredClone({ ...d, createdAt: undefined, expiresAt: undefined }), createdAt: new Date(d.createdAt), expiresAt: new Date(d.expiresAt) });

export class MemoryCollabStore implements CollabStore {
  private docs = new Map<string, WorkspaceDoc>();
  private readonly clock: () => number;
  constructor(clock: () => number = Date.now) { this.clock = clock; }
  async get(ws: string) { const d = this.docs.get(ws); return live(d, this.clock()) ? clone(d) : null; }
  async create(ws: string, doc: WorkspaceDoc) { if (this.docs.has(ws)) return false; this.docs.set(ws, clone(doc)); return true; }
  async update(ws: string, fn: (d: WorkspaceDoc) => WorkspaceDoc, now: number) {
    const d = this.docs.get(ws);
    if (!live(d, now)) return null;
    const next = fn(clone(d)); // fn may throw: the stored doc is untouched
    this.docs.set(ws, next);
    return clone(next);
  }
}

const toDate = (v: unknown): Date => (v instanceof Date ? v : v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : new Date(typeof v === "number" ? v : 0));

/**
 * One Firestore document per workspace at `<collection>/<ws>` (default `collab_workspaces`).
 * OPERATOR: enable a Firestore TTL policy on the `expiresAt` field of this collection group (createdAt + 30 days) so
 * expired workspaces are deleted. Reads also ignore expired docs, so the policy is cleanup only. Not run from code.
 */
export class FirestoreCollabStore implements CollabStore {
  private readonly db: TxDb;
  private readonly collection: string;
  constructor(opts: { db: TxDb; collection?: string }) { this.db = opts.db; this.collection = opts.collection ?? "collab_workspaces"; }
  private path(ws: string) { return `${this.collection}/${ws}`; }
  private read(raw: Record<string, unknown> | undefined): WorkspaceDoc | undefined {
    if (!raw) return undefined;
    return { ...(raw as unknown as WorkspaceDoc), createdAt: toDate(raw.createdAt), expiresAt: toDate(raw.expiresAt) };
  }
  async get(ws: string) {
    const ref = this.db.doc(this.path(ws));
    const d = await this.db.runTransaction(async (tx) => { const s = await tx.get(ref); return s.exists ? this.read(s.data()) : undefined; });
    return live(d, Date.now()) ? d : null;
  }
  async create(ws: string, doc: WorkspaceDoc) {
    const ref = this.db.doc(this.path(ws));
    return this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.set(ref, doc as unknown as Record<string, unknown>);
      return true;
    });
  }
  async update(ws: string, fn: (d: WorkspaceDoc) => WorkspaceDoc, now: number) {
    const ref = this.db.doc(this.path(ws));
    return this.db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const d = s.exists ? this.read(s.data()) : undefined;
      if (!live(d, now)) return null;
      const next = fn(d);
      tx.set(ref, next as unknown as Record<string, unknown>);
      return next;
    });
  }
}

export { TTL_DAYS };
