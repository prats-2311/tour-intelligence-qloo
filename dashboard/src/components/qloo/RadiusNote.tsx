import { radiusNote } from "@/lib/qloo/radius";
import type { ScoredCity } from "@/lib/qloo/types";

/** "Nearest other stop: Mexico City, 460 km — check radius clauses." from coordinates already on the board. Renders nothing without a neighbour. */
export function RadiusNote({ city, pool, className = "" }: { city: ScoredCity; pool: ScoredCity[]; className?: string }) {
  const note = radiusNote(city, pool);
  if (!note) return null;
  return <p data-testid="radius-note" className={`text-[13px] text-canvas-muted ${className}`}>{note}</p>;
}
