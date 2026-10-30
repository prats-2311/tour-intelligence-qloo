import { blankBudget, type Budget } from "./math";

export const EXAMPLE_BANNER = "Example budget with fictional figures — replace with your own.";

/** Round placeholder figures that are obviously not market data (they carry no source and the banner says so). */
export function exampleBudget(cityIds: string[], legKeys: string[]): Budget {
  const b = blankBudget(cityIds);
  for (const id of cityIds) b.cities[id] = { artistFee: "10000", venue: "2000", production: "1000", crew: "500", marketing: "500", ticketPrice: "50", capacity: "1000", sellThrough: "80", merchPerHead: "10", sponsor: "5000", sponsorName: "" };
  for (const k of legKeys) b.legs[k] = "1000";
  return { ...b, perDiem: "50", crewSize: "10", hotel: "100", rooms: "5", example: true };
}
