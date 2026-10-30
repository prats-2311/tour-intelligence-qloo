export const CITY_PLAN_LABEL = "Draft a city plan";

/** The fixed question behind "Draft a city plan": same sections every time, so plans compare across cities. */
export function cityPlanPrompt(cityName: string): string {
  return `Draft a one-page plan for ${cityName}: the sponsor pitch, the best room, the opening act, promo zones, timing, and risks (from Advance if it is loaded). If I attached documents, add a short "What your documents add" section and cite each point.`;
}
