import type { OwnerDoc, TourDoc } from "./model.js";

/** Owners are keyed by sha256(token); tours by id. `saveTour` with `chunks` replaces them all (stale ones deleted); without, keeps the stored run. */
export interface ToursStore {
  createOwner(hash: string, doc: OwnerDoc): Promise<void>;
  getOwner(hash: string): Promise<OwnerDoc | null>;
  touchOwner(hash: string, at: Date): Promise<void>;
  listTours(ownerHash: string): Promise<Array<TourDoc & { id: string }>>;
  getTour(id: string): Promise<TourDoc | null>;
  saveTour(id: string, doc: TourDoc, chunks?: string[]): Promise<void>;
  readChunks(id: string): Promise<string[]>;
  deleteTour(id: string): Promise<void>;
}

const cp = <T extends object>(d: T): T => structuredClone(d);

export class MemoryToursStore implements ToursStore {
  private owners = new Map<string, OwnerDoc>();
  private tours = new Map<string, TourDoc>();
  private chunks = new Map<string, string[]>();
  async createOwner(hash: string, doc: OwnerDoc) { this.owners.set(hash, cp(doc)); }
  async getOwner(hash: string) { const d = this.owners.get(hash); return d ? cp(d) : null; }
  async touchOwner(hash: string, at: Date) { const d = this.owners.get(hash); if (d) d.lastSeenAt = new Date(at); }
  async listTours(ownerHash: string) { return [...this.tours].filter(([, t]) => t.ownerHash === ownerHash).map(([id, t]) => ({ id, ...cp(t) })); }
  async getTour(id: string) { const d = this.tours.get(id); return d ? cp(d) : null; }
  async saveTour(id: string, doc: TourDoc, chunks?: string[]) { this.tours.set(id, cp(doc)); if (chunks) this.chunks.set(id, [...chunks]); }
  async readChunks(id: string) { return [...(this.chunks.get(id) ?? [])]; }
  async deleteTour(id: string) { this.tours.delete(id); this.chunks.delete(id); }
  /** Test helper: everything stored, to assert no raw token is ever kept. */
  dump() { return { owners: [...this.owners], tours: [...this.tours], chunks: [...this.chunks] }; }
}

/** The slice of the Firestore API used here (the real `Firestore` satisfies it); tests pass a fake. */
export interface FsDocRef { get(): Promise<{ exists: boolean; id: string; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<unknown>; delete(): Promise<unknown> }
export interface FsQuery { where(field: string, op: "==", value: unknown): FsQuery; get(): Promise<{ docs: Array<{ exists: boolean; id: string; data(): Record<string, unknown> | undefined }> }> }
export interface FsBatch { set(ref: never, d: Record<string, unknown>): unknown; delete(ref: never): unknown; commit(): Promise<unknown> }
export interface FsLike { doc(path: string): FsDocRef; collection(path: string): FsQuery; batch(): FsBatch }

const toDate = (v: unknown): Date => (v instanceof Date ? v : v && typeof (v as { toDate?: unknown }).toDate === "function" ? (v as { toDate(): Date }).toDate() : new Date(typeof v === "number" ? v : 0));
const readTour = (raw: Record<string, unknown>): TourDoc => ({ ...(raw as unknown as TourDoc), createdAt: toDate(raw.createdAt), updatedAt: toDate(raw.updatedAt), expiresAt: toDate(raw.expiresAt) });

/**
 * `tour_owners/<sha256(token)>`, `user_tours/<id>` and `user_tours/<id>/chunks/<n>` ({ data: string }, at most 700,000 ASCII chars each).
 * OPERATOR: enable a Firestore TTL policy on `expiresAt` for collection group `user_tours` (updatedAt + 180 days). The chunk
 * subcollection docs carry the same `expiresAt` so one TTL policy on collection group `chunks` clears them too. Not run from code.
 * Querying owner tours by `ownerHash` equality needs only the automatic single-field index.
 */
export class FirestoreToursStore implements ToursStore {
  private readonly db: FsLike;
  constructor(opts: { db: FsLike }) { this.db = opts.db; }
  async createOwner(hash: string, doc: OwnerDoc) { await this.db.doc(`tour_owners/${hash}`).set({ ...doc }); }
  async getOwner(hash: string) {
    const s = await this.db.doc(`tour_owners/${hash}`).get();
    const d = s.exists ? s.data() : undefined;
    return d ? { ...(d as unknown as OwnerDoc), createdAt: toDate(d.createdAt), lastSeenAt: toDate(d.lastSeenAt) } : null;
  }
  async touchOwner(hash: string, at: Date) {
    const ref = this.db.doc(`tour_owners/${hash}`);
    const s = await ref.get();
    if (s.exists) await ref.set({ ...s.data()!, lastSeenAt: at });
  }
  async listTours(ownerHash: string) {
    const snap = await this.db.collection("user_tours").where("ownerHash", "==", ownerHash).get();
    return snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...readTour(d.data()!) }));
  }
  async getTour(id: string) {
    const s = await this.db.doc(`user_tours/${id}`).get();
    return s.exists ? readTour(s.data()!) : null;
  }
  async saveTour(id: string, doc: TourDoc, chunks?: string[]) {
    if (!chunks) return void (await this.db.doc(`user_tours/${id}`).set({ ...doc }));
    const old = (await this.db.collection(`user_tours/${id}/chunks`).get()).docs.map((d) => d.id);
    const batch = this.db.batch();
    chunks.forEach((data, n) => batch.set(this.db.doc(`user_tours/${id}/chunks/${n}`) as never, { data, expiresAt: doc.expiresAt }));
    for (const oid of old) if (!(Number(oid) < chunks.length)) batch.delete(this.db.doc(`user_tours/${id}/chunks/${oid}`) as never);
    batch.set(this.db.doc(`user_tours/${id}`) as never, { ...doc });
    await batch.commit();
  }
  async readChunks(id: string) {
    const snap = await this.db.collection(`user_tours/${id}/chunks`).get();
    return snap.docs.filter((d) => d.exists).sort((a, b) => Number(a.id) - Number(b.id)).map((d) => String(d.data()!.data ?? ""));
  }
  async deleteTour(id: string) {
    const old = (await this.db.collection(`user_tours/${id}/chunks`).get()).docs.map((d) => d.id);
    const batch = this.db.batch();
    for (const oid of old) batch.delete(this.db.doc(`user_tours/${id}/chunks/${oid}`) as never);
    batch.delete(this.db.doc(`user_tours/${id}`) as never);
    await batch.commit();
  }
}
