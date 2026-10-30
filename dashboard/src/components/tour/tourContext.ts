import { createContext, useContext } from "react";

export interface TourApi {
  /** Starts the guided tour at step 1 (navigates to the recorded board). */
  start: () => void;
  /** Starts the /v2 concept tour (its own steps and storage key; the v1 tour is untouched). */
  startV2: () => void;
  active: boolean;
}

export const TourContext = createContext<TourApi | null>(null);

/** Null outside a TourProvider, so pages that offer the tour render fine without one. */
export const useTour = (): TourApi | null => useContext(TourContext);
