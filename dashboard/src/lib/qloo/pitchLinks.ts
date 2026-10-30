/** Query keys a pitch sheet link carries over from the page it was opened on: the example set, the team workspace. Nothing else. */
const KEEP = ["showcase", "sample", "ws"] as const;

export function carryQuery(from: URLSearchParams, fallback = ""): string {
  const out = new URLSearchParams();
  for (const k of KEEP) { const v = from.get(k); if (v) out.set(k, v); }
  if (!out.has("showcase") && !out.has("sample") && fallback) { const f = new URLSearchParams(fallback.replace(/^\?/, "")); for (const [k, v] of f) out.set(k, v); }
  const q = out.toString();
  return q ? `?${q}` : "";
}

export const pitchPath = (cityId: string, brand: string, search = ""): string => `/tours/pitch/${encodeURIComponent(cityId)}/${encodeURIComponent(brand)}${search}`;
