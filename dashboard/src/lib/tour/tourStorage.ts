/** Dismissal or completion of the guided tour. Every access is guarded: storage can throw (private windows, blocked site data). */
export const TOUR_STORAGE_KEY = "tiq.tour.v1";
export type TourOutcome = "dismissed" | "completed";

/** The v2 concept tour keeps its own key; the v1 key above is never read or written for it. */
export const V2_TOUR_STORAGE_KEY = "tiq.tour.v2";

export function writeV2TourOutcome(outcome: TourOutcome): void {
  try {
    window.localStorage.setItem(V2_TOUR_STORAGE_KEY, outcome);
  } catch {
    /* nothing depends on it */
  }
}

/** Per-tour outcome for the follow-on tours (`tiq.tour.<id>`); the essentials keep the v1 key through `tourStorageKey`. */
export function readOutcomeAt(key: string): TourOutcome | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "dismissed" || v === "completed" ? v : null;
  } catch {
    return null;
  }
}

export function writeOutcomeAt(key: string, outcome: TourOutcome): void {
  try {
    window.localStorage.setItem(key, outcome);
  } catch {
    /* the tour still works; the tick may not survive a reload */
  }
}
