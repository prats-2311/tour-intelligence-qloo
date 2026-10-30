import { createContext, useContext } from "react";
import type { TourId } from "@/lib/tour/tours";

export interface TourApi {
  /** Starts the guided tour at step 1 (navigates to the recorded board). */
  start: () => void;
  /** Starts the /v2 concept tour (its own steps and storage key; the v1 tour is untouched). */
  startV2: () => void;
  /** Starts one of the four registry tours at step 1. */
  startTour: (id: TourId) => void;
  active: boolean;
  /** Which tours were finished (not just skipped): the ticks in the sidebar. */
  completed: Record<TourId, boolean>;
}

export const TourContext = createContext<TourApi | null>(null);

/** Null outside a TourProvider, so pages that offer the tour render fine without one. */
export const useTour = (): TourApi | null => useContext(TourContext);
