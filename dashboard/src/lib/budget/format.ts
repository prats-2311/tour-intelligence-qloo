export const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
export const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-paper-raised px-4 text-[14px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

import type { CityInputs } from "./math";

/** True when the user typed anything for this city. */
export const hasBudget = (c: CityInputs | undefined): boolean => !!c && Object.entries(c).some(([k, v]) => k !== "sponsorName" && v.trim() !== "");

