/** Dismissal or completion of the guided tour. Every access is guarded: storage can throw (private windows, blocked site data). */
export const TOUR_STORAGE_KEY = "tiq.tour.v1";
export type TourOutcome = "dismissed" | "completed";

export function readTourOutcome(): TourOutcome | null {
  try {
    const v = window.localStorage.getItem(TOUR_STORAGE_KEY);
    return v === "dismissed" || v === "completed" ? v : null;
  } catch {
    return null;
  }
}

export function writeTourOutcome(outcome: TourOutcome): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, outcome);
  } catch {
    /* the tour still works; the prompt may come back next visit */
  }
}

/** The v2 concept tour keeps its own key; the v1 key above is never read or written for it. */
export const V2_TOUR_STORAGE_KEY = "tiq.tour.v2";

export function writeV2TourOutcome(outcome: TourOutcome): void {
  try {
    window.localStorage.setItem(V2_TOUR_STORAGE_KEY, outcome);
  } catch {
    /* nothing depends on it */
  }
}
