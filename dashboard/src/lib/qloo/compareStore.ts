import { useSyncExternalStore } from "react";
import { fetchSponsorsWithoutQloo } from "./client";
import { COMPARE_ERROR, type SponsorsCompare } from "./sponsorsCompare";
import type { SegmentRequest } from "./segmentStore";

/** Session store for "the same model, without Qloo", one entry per artist and city. Nothing loads until `loadCompare` is called (a click). */
export type CompareState = { status: "idle" } | { status: "loading" } | { status: "done"; data: SponsorsCompare };

const IDLE: CompareState = { status: "idle" };
const states = new Map<string, CompareState>();
const inflight = new Map<string, Promise<CompareState>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const compareKey = (artistId: string, city: { id?: string; name: string; country: string }): string => `${artistId}|${city.id ?? city.name}|${city.country}`;
export function getCompare(key: string): CompareState { return states.get(key) ?? IDLE; }

/** A good answer is kept (no second call); an unavailable answer may be retried by calling again. */
export function loadCompare(req: SegmentRequest, opts: { fetchImpl?: typeof fetch } = {}): Promise<CompareState> {
  const key = compareKey(req.artistId, req.city);
  const have = states.get(key);
  if (have?.status === "done" && have.data.status !== "unavailable") return Promise.resolve(have);
  const pending = inflight.get(key);
  if (pending) return pending;
  states.set(key, { status: "loading" });
  notify();
  const job = fetchSponsorsWithoutQloo({ artistId: req.artistId, artist: req.artist ?? "", city: req.city.name, country: req.city.country, ...(req.city.id ? { cityId: req.city.id } : {}), ...(req.city.lat !== undefined ? { lat: req.city.lat } : {}), ...(req.city.lon !== undefined ? { lon: req.city.lon } : {}) }, { fetchImpl: opts.fetchImpl })
    .then((data): CompareState => { const s: CompareState = { status: "done", data }; states.set(key, s); notify(); return s; })
    .catch((): CompareState => { const s: CompareState = { status: "done", data: COMPARE_ERROR }; states.set(key, s); notify(); return s; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, job);
  return job;
}

export function useCompare(key: string | null): CompareState {
  return useSyncExternalStore(subscribe, () => (key ? getCompare(key) : IDLE));
}

/** Test seam: forget everything. */
export function resetCompare(): void { states.clear(); inflight.clear(); notify(); }
