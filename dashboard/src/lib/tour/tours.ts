import type { Showcase } from "@/lib/qloo/showcase";
import { planTourSteps, teamTourSteps, trustTourSteps } from "./otherTours";
import { buildTourSteps, type TourStep } from "./tourSteps";

export type TourId = "essentials" | "plan" | "team" | "trust";

export interface TourDef {
  id: TourId;
  title: string;
  minutes: number;
  /** Built from the loaded recording at the moment the tour starts. */
  steps: (show: Showcase) => TourStep[];
  /** The tour needs the private demo workspace, so it is listed only while collaboration is on. */
  requires?: "workspace";
}

export const TOURS: readonly TourDef[] = [
  { id: "essentials", title: "The essentials", minutes: 1, steps: buildTourSteps },
  { id: "plan", title: "Plan the tour", minutes: 2, steps: planTourSteps },
  { id: "team", title: "Work as a team", minutes: 2, steps: teamTourSteps, requires: "workspace" },
  { id: "trust", title: "Trust and agents", minutes: 1, steps: trustTourSteps },
];

export const tourById = (id: string): TourDef | undefined => TOURS.find((t) => t.id === id);

/** The tour after `id`, skipping any that `available` rules out; null after the last. */
export function nextTour(id: TourId, available: (t: TourDef) => boolean = () => true): TourDef | null {
  const i = TOURS.findIndex((t) => t.id === id);
  return TOURS.slice(i + 1).find(available) ?? null;
}

/** The essentials keep the original `tiq.tour.v1` key, so returning visitors are not prompted again; the rest use `tiq.tour.<id>`. */
export const tourStorageKey = (id: TourId): string => (id === "essentials" ? "tiq.tour.v1" : `tiq.tour.${id}`);
