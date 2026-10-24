import { useEffect, useSyncExternalStore } from "react";
import { streamCityPlaybook } from "./client";
import type { SampleSet } from "./types";
import { initialPlaybook, playbookReducer, type PlaybookState } from "./playbookReducer";

export interface PlaybookRequest { artist: string; artistEntityId: string; artistPopularity?: number; city: { id: string; name: string; country: string; lat?: number; lon?: number }; sample: boolean; sampleSet?: SampleSet; delayMs?: number }

const states = new Map<string, PlaybookState>();
const inflight = new Map<string, Promise<PlaybookState>>();
let epoch = 0; // bumped by resetPlaybooks so a job still running in the background cannot repopulate the cleared store
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const playbookKey = (artistEntityId: string, cityId: string, sampleSet?: SampleSet): string => `${artistEntityId}|${cityId}|${sampleSet ?? "default"}`;
const keyOf = (r: PlaybookRequest) => playbookKey(r.artistEntityId, r.city.id, r.sampleSet);

export function getPlaybook(key: string): PlaybookState | undefined { return states.get(key); }

function putState(key: string, s: PlaybookState): PlaybookState { states.set(key, s); notify(); return s; }

// No AbortController: playbooks are shared across pages and finish in the background, so a page
// unmounting must not cancel a playbook another page is waiting for.
export function loadPlaybook(req: PlaybookRequest): Promise<PlaybookState> {
  const key = keyOf(req);
  const existing = states.get(key);
  if (existing?.status === "done") return Promise.resolve(existing);
  const pending = inflight.get(key);
  if (pending) return pending;
  const born = epoch;
  const put = (k: string, v: PlaybookState): PlaybookState => (born === epoch ? putState(k, v) : v);
  const job = (async () => {
    let s = put(key, playbookReducer(initialPlaybook, { type: "start", source: !req.sample ? "live" : req.sampleSet === "showcase" ? "showcase" : "sample" }));
    let terminal = false;
    try {
      const events = streamCityPlaybook(
        { artist: req.artist, artistEntityId: req.artistEntityId, ...(req.artistPopularity === undefined ? {} : { artistPopularity: req.artistPopularity }), city: req.city.name, country: req.city.country },
        { sample: req.sample, sampleSet: req.sampleSet, cityId: req.city.id, lat: req.city.lat, lon: req.city.lon, delayMs: req.delayMs },
      );
      for await (const event of events) {
        s = put(key, playbookReducer(s, { type: "event", event }));
        if (event.type === "done" || event.type === "error") terminal = true;
      }
    } catch { /* fall through to interrupted */ }
    if (!terminal) s = put(key, playbookReducer(s, { type: "interrupted" }));
    return s;
  })().finally(() => { inflight.delete(key); });
  inflight.set(key, job);
  return job;
}

export function usePlaybook(req: PlaybookRequest | null): PlaybookState {
  const key = req ? keyOf(req) : null;
  const state = useSyncExternalStore(subscribe, () => (key ? states.get(key) ?? initialPlaybook : initialPlaybook));
  useEffect(() => { if (req) void loadPlaybook(req); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Subscribed read of one entry without triggering a load (for callers that gate loading themselves). */
export function usePlaybookSnapshot(key: string): PlaybookState | undefined {
  return useSyncExternalStore(subscribe, () => states.get(key));
}

export function resetPlaybooks(): void { epoch++; states.clear(); inflight.clear(); notify(); }
