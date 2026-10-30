import { buildLegs, legTotals, type Stop } from "./legs";

/** Your numbers, our maths, real distances: nothing here supplies a cost or a market rate. Every input is a string the user typed ("" = blank). */
export type Currency = "USD" | "MXN" | "BRL";
export const CURRENCIES: Currency[] = ["USD", "MXN", "BRL"];
export const SENSITIVITY = [60, 80, 100] as const;

export interface CityInputs {
  artistFee: string; venue: string; production: string; crew: string; marketing: string;
  ticketPrice: string; capacity: string; sellThrough: string; merchPerHead: string; sponsor: string;
  /** Name only, linked from the city's playbook top sponsors. */
  sponsorName: string;
}
export interface Budget {
  currency: Currency;
  cities: Record<string, CityInputs>;
  /** Travel cost per leg, keyed `from>to`. */
  legs: Record<string, string>;
  perDiem: string; crewSize: string; hotel: string; rooms: string;
  /** True while the fictional example is loaded; any edit keeps the banner until the budget is cleared. */
  example: boolean;
}

export const COST_FIELDS = ["artistFee", "venue", "production", "crew", "marketing"] as const;
export const blankCity = (): CityInputs => ({ artistFee: "", venue: "", production: "", crew: "", marketing: "", ticketPrice: "", capacity: "", sellThrough: "", merchPerHead: "", sponsor: "", sponsorName: "" });
export const blankBudget = (cityIds: string[]): Budget => ({ currency: "USD", cities: Object.fromEntries(cityIds.map((id) => [id, blankCity()])), legs: {}, perDiem: "", crewSize: "", hotel: "", rooms: "", example: false });

/** A typed number, or null for blank, unparseable or negative text. Never 0 for "nothing typed". */
export function parseMoney(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Hotel nights and per-diem days: one show day per city plus the travel days. */
export const nightsFor = (cityCount: number, legs: ReturnType<typeof buildLegs>): number => cityCount + legTotals(legs).days;

const sum = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/**
 * Break-even tickets = ceil((city costs - sponsor contribution) / (ticket price + merch per head)).
 * Needs at least one cost and a ticket price (a blank merch is 0); a sponsor above the costs gives 0, never negative.
 */
export function breakEvenTickets(c: CityInputs): number | null {
  const cost = sum(COST_FIELDS.map((f) => parseMoney(c[f])));
  const price = parseMoney(c.ticketPrice);
  if (cost === null || price === null) return null;
  const per = price + (parseMoney(c.merchPerHead) ?? 0);
  if (per <= 0) return null;
  return Math.ceil(Math.max(0, cost - (parseMoney(c.sponsor) ?? 0)) / per);
}

const incomeAt = (c: CityInputs, pct: number | null): number | null => {
  const price = parseMoney(c.ticketPrice), cap = parseMoney(c.capacity);
  if (price === null || cap === null || pct === null) return null;
  return cap * (pct / 100) * (price + (parseMoney(c.merchPerHead) ?? 0)) + (parseMoney(c.sponsor) ?? 0);
};
const pctOf = (s: string): number | null => { const n = parseMoney(s); return n === null || n > 100 ? null : n; };

export interface CityResult {
  cost: number | null; income: number | null; margin: number | null; breakEven: number | null; overCapacity: boolean;
  sensitivity: Array<{ pct: number; income: number | null; margin: number | null }>;
  hints: { cost: string; income: string; margin: string; breakEven: string };
}
export function cityResult(c: CityInputs): CityResult {
  const cost = sum(COST_FIELDS.map((f) => parseMoney(c[f])));
  const income = incomeAt(c, pctOf(c.sellThrough));
  const breakEven = breakEvenTickets(c);
  const cap = parseMoney(c.capacity);
  const m = (inc: number | null) => (inc === null || cost === null ? null : inc - cost);
  return {
    cost, income, margin: m(income), breakEven,
    overCapacity: breakEven !== null && cap !== null && breakEven > cap,
    sensitivity: SENSITIVITY.map((pct) => { const inc = incomeAt(c, pct); return { pct, income: inc, margin: m(inc) }; }),
    hints: {
      cost: "Fill in at least one cost to see cost",
      income: "Fill in ticket price, capacity and sell-through % to see income",
      margin: cost === null ? "Fill in at least one cost to see margin" : "Fill in ticket price, capacity and sell-through % to see margin",
      breakEven: cost === null ? "Fill in at least one cost to see break-even tickets" : "Fill in ticket price to see break-even tickets",
    },
  };
}

export interface TourResult {
  nights: number; legCost: number | null; perDiemCost: number | null; hotelCost: number | null;
  cost: number | null; income: number | null; margin: number | null;
  sensitivity: Array<{ pct: number; margin: number | null }>;
  hints: { perDiem: string; hotel: string; margin: string };
}
export function tourResult(b: Budget, stops: Stop[]): TourResult {
  const legs = buildLegs(stops);
  const nights = nightsFor(stops.length, legs);
  const results = stops.map((s) => cityResult(b.cities[s.id] ?? blankCity()));
  const legCost = sum(legs.map((l) => parseMoney(b.legs[l.key])));
  const rate = parseMoney(b.perDiem), crew = parseMoney(b.crewSize), hotel = parseMoney(b.hotel), rooms = parseMoney(b.rooms);
  const perDiemCost = rate !== null && crew !== null ? rate * crew * nights : null;
  const hotelCost = hotel !== null && rooms !== null ? hotel * rooms * nights : null;
  const shared = sum([legCost, perDiemCost, hotelCost]);
  const cost = sum([...results.map((r) => r.cost), shared]);
  const allIncome = results.every((r) => r.income !== null);
  const income = allIncome && results.length ? results.reduce((a, r) => a + r.income!, 0) : null;
  const missing = stops.filter((_, i) => results[i]!.income === null).map((s) => s.name);
  const total = (pick: (r: CityResult) => number | null) => (cost !== null && results.length && results.every((r) => pick(r) !== null) ? results.reduce((a, r) => a + pick(r)!, 0) - cost : null);
  return {
    nights, legCost, perDiemCost, hotelCost, cost, income,
    margin: income !== null && cost !== null ? income - cost : null,
    sensitivity: SENSITIVITY.map((pct, i) => ({ pct, margin: total((r) => r.sensitivity[i]!.income) })),
    hints: {
      perDiem: rate === null && crew === null ? "Fill in per diem and crew size to see per diems" : rate === null ? "Fill in per diem to see per diems" : "Fill in crew size to see per diems",
      hotel: hotel === null && rooms === null ? "Fill in hotel per night and rooms to see hotels" : hotel === null ? "Fill in hotel per night to see hotels" : "Fill in rooms to see hotels",
      margin: missing.length ? `Fill in ticket price, capacity and sell-through % for ${missing.join(", ")} to see the tour margin` : "Fill in at least one cost to see the tour margin",
    },
  };
}

/** Copies one city's money inputs to every city; the sponsor link is city-specific, so it stays where it is. Returns a new budget. */
export function copyCityToAll(b: Budget, fromId: string): Budget {
  const src = b.cities[fromId];
  if (!src) return b;
  return { ...b, cities: Object.fromEntries(Object.entries(b.cities).map(([id, c]) => [id, id === fromId ? c : { ...src, sponsorName: c.sponsorName }])) };
}
