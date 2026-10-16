export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
