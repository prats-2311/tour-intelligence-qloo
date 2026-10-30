import { useSyncExternalStore } from "react";
import { fetchSponsorSegments } from "./client";
import { SEGMENTS_ERROR, type SponsorSegments } from "./segments";

/** Session store for sponsors by age group, one entry per artist and city. Nothing loads until `loadSegments` is called (a click); the Tour Book only reads. */
export interface SegmentRequest { artistId: string; artist?: string; city: { id?: string; name: string; country: string; lat?: number; lon?: number } }
export type SegmentState = { status: "idle" } | { status: "loading" } | { status: "done"; data: SponsorSegments };

const IDLE: SegmentState = { status: "idle" };
const states = new Map<string, SegmentState>();
const inflight = new Map<string, Promise<SegmentState>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const segmentKey = (artistId: string, city: { id?: string; name: string; country: string }): string => `${artistId}|${city.id ?? city.name}|${city.country}`;

export function getSegments(key: string): SegmentState { return states.get(key) ?? IDLE; }

/** A finished answer is kept (no second call); an unavailable answer may be retried by calling again. */
export function loadSegments(req: SegmentRequest, opts: { fetchImpl?: typeof fetch } = {}): Promise<SegmentState> {
  const key = segmentKey(req.artistId, req.city);
  const have = states.get(key);
  if (have?.status === "done" && have.data.status !== "unavailable") return Promise.resolve(have);
  const pending = inflight.get(key);
  if (pending) return pending;
  states.set(key, { status: "loading" });
  notify();
  const job = fetchSponsorSegments({ artistId: req.artistId, ...(req.artist ? { artist: req.artist } : {}), city: req.city.name, country: req.city.country, ...(req.city.id ? { cityId: req.city.id } : {}), ...(req.city.lat !== undefined ? { lat: req.city.lat } : {}), ...(req.city.lon !== undefined ? { lon: req.city.lon } : {}) }, { fetchImpl: opts.fetchImpl })
    .then((data): SegmentState => { const s: SegmentState = { status: "done", data }; states.set(key, s); notify(); return s; })
    .catch((): SegmentState => { const s: SegmentState = { status: "done", data: SEGMENTS_ERROR }; states.set(key, s); notify(); return s; }) // never leave an entry stuck on "loading"
    .finally(() => { inflight.delete(key); });
  inflight.set(key, job);
  return job;
}

/** Subscribed read of one entry. Never triggers a load. */
export function useSegments(key: string | null): SegmentState {
  return useSyncExternalStore(subscribe, () => (key ? getSegments(key) : IDLE));
}

/** Test seam: forget everything. */
export function resetSegments(): void { states.clear(); inflight.clear(); notify(); }
