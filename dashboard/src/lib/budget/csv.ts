import { buildLegs, legTotals, type Stop } from "./legs";
import { blankCity, cityResult, tourResult, type Budget } from "./math";

const cell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...v: Array<string | number | null | undefined>): string => v.map(cell).join(",");

/** The budget table as CSV: cities, then legs, then tour totals. Blank stays blank; nothing is estimated. */
export function budgetCsv(b: Budget, stops: Stop[]): string {
  const legs = buildLegs(stops);
  const t = tourResult(b, stops);
  const lt = legTotals(legs);
  const out = [row("City", "Currency", "Artist fee", "Venue", "Production", "Local crew", "Marketing", "Ticket price", "Capacity", "Sell-through %", "Merch per head", "Sponsor", "Sponsor name", "Cost", "Income", "Margin", "Break-even tickets")];
  for (const s of stops) {
    const c = b.cities[s.id] ?? blankCity(), r = cityResult(c);
    out.push(row(s.name, b.currency, c.artistFee, c.venue, c.production, c.crew, c.marketing, c.ticketPrice, c.capacity, c.sellThrough, c.merchPerHead, c.sponsor, c.sponsorName, r.cost, r.income, r.margin, r.breakEven));
  }
  out.push("", row("Leg", "From", "To", "Km", "Mode", "Travel days", "Travel cost"));
  legs.forEach((l, i) => out.push(row(i + 1, l.fromName, l.toName, l.km === null ? "" : Math.round(l.km), l.mode, l.days, b.legs[l.key])));
  out.push("", row("Tour totals", "Value"));
  out.push(row("Km", Math.round(lt.km)), row("Legs", lt.legs), row("Travel days", lt.days), row("Nights", t.nights),
    row("Legs travel cost", t.legCost), row("Per diems", t.perDiemCost), row("Hotels", t.hotelCost), row("Cost", t.cost), row("Income", t.income), row("Margin", t.margin));
  return out.join("\n");
}
