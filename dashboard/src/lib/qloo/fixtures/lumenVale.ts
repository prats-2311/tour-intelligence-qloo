import type { GatewayEvent, ScoredCity, TourBrief } from "../types";

export const SAMPLE_BRIEF: TourBrief = { artist: "Lumen Vale", regions: ["Mexico", "Brazil", "United States"], maxStops: 8, dateWindow: { start: "2027-03-12", end: "2027-04-18" } };

const ref = (tool: string, k: string) => [{ tool, cacheKey: `sample-${k}` }];
const s = (v: number, k: string) => ({ value: v, refs: ref("qloo_where_popular", k) });
const city = (id: string, name: string, country: string, lat: number, lon: number, fan: number, act: number, win: number,
  verdict: ScoredCity["verdict"], components: ScoredCity["activation"]["components"]): ScoredCity => ({
  id, name, country, lat, lon, fanHeat: s(fan, `${id}-fan`),
  activation: { value: act, refs: ref("qloo_recommend", `${id}-act`), components },
  winnability: { value: win, refs: [...ref("qloo_where_popular", `${id}-fan`), ...ref("qloo_recommend", `${id}-act`)] },
  verdict, warnings: [],
  zones: [
    { label: `${name} centre`, lat, lon, affinity: 0.6, index: 0, share: 0.38 },
    { label: `${name} north`, lat: lat + 0.04, lon: lon + 0.02, affinity: 0.4, index: 1, share: 0.26 },
    { label: `${name} west`, lat: lat - 0.02, lon: lon - 0.05, affinity: 0.25, index: 2, share: 0.17 },
  ],
});

export const SAMPLE_CITIES: ScoredCity[] = [
  city("3530597", "Mexico City", "MX", 19.4326, -99.1332, 91, 77, 84, "play", { sponsor_fit: 0.8, local_hooks: 0.74, fan_concentration: 0.82, venue_fit: 0.71 }),
  city("3448439", "São Paulo", "BR", -23.5505, -46.6333, 84, 66, 75, "play", { sponsor_fit: 0.7, local_hooks: 0.62, fan_concentration: 0.71, venue_fit: 0.6 }),
  city("4005539", "Guadalajara", "MX", 20.6597, -103.3496, 62, 82, 72, "hidden_goldmine", { sponsor_fit: 0.84, local_hooks: 0.79, fan_concentration: 0.81, venue_fit: 0.86 }),
  city("3464975", "Curitiba", "BR", -25.4284, -49.2733, 51, 77, 64, "hidden_goldmine", { sponsor_fit: 0.78, local_hooks: 0.8, fan_concentration: 0.76, venue_fit: 0.72 }),
  city("5368361", "Los Angeles", "US", 34.0522, -118.2437, 88, 40, 64, "de_risk", { sponsor_fit: 0.38, local_hooks: 0.41, fan_concentration: 0.44, venue_fit: 0.36 }),
  city("3451190", "Rio de Janeiro", "BR", -22.9068, -43.1729, 72, 54, 63, "consider", { sponsor_fit: 0.58, local_hooks: 0.52, fan_concentration: 0.55, venue_fit: 0.5 }),
  city("4671654", "Austin", "US", 30.2672, -97.7431, 66, 52, 59, "consider", { sponsor_fit: 0.55, local_hooks: 0.5, fan_concentration: 0.53, venue_fit: 0.49 }),
  city("3995465", "Monterrey", "MX", 25.6866, -100.3161, 57, 59, 58, "consider", { sponsor_fit: 0.61, local_hooks: 0.55, fan_concentration: 0.63, venue_fit: 0.57 }),
  city("4887398", "Chicago", "US", 41.8781, -87.6298, 47, 49, 48, "skip", { sponsor_fit: 0.5, local_hooks: 0.47, fan_concentration: 0.49, venue_fit: 0.48 }),
  {
    id: "3470127", name: "Belo Horizonte", country: "BR", lat: -19.9167, lon: -43.9345,
    fanHeat: s(55, "3470127-fan"),
    activation: { value: null, reason: "insufficient_data", refs: [], components: { fan_concentration: 0.52 } },
    winnability: { value: null, reason: "insufficient_data", refs: [] },
    verdict: "insufficient_data", zones: [],
    warnings: [{ tool: "qloo_recommend", kind: "partial", message: "1 of 4 activation inputs returned data" }],
  },
];

const call = (tool: string, args: Record<string, unknown>, n: number, k: string): GatewayEvent[] => [
  { type: "tool_call", tool, args, cached: true },
  { type: "tool_result", tool, status: "ok", resultCount: n, cacheKey: `sample-${k}`, stale: false },
];

export const LUMEN_VALE_SAMPLE: GatewayEvent[] = [
  ...call("qloo_describe", { entity: "Lumen Vale", type: "artist" }, 1, "describe"),
  { type: "resolve", entity: { entityId: "sample-lumen-vale", name: "Lumen Vale" } },
  ...call("qloo_audience_demographics", { entity: "sample-lumen-vale" }, 6, "demo"),
  ...call("qloo_entity_tags", { entities: ["sample-lumen-vale"] }, 6, "tags"),
  ...call("qloo_trends", { entities: ["sample-lumen-vale"] }, 1, "trends"),
  ...["Mexico", "Brazil", "United States"].flatMap((r, i) => call("qloo_where_popular", { within: r }, [14, 11, 9][i]!, `heat-${i}`)),
  {
    type: "artist_profile",
    demographics: [
      { label: "≤24", index: 0.41 }, { label: "25–29", index: 0.22 }, { label: "30–34", index: 0.05 },
      { label: "35–44", index: -0.18 }, { label: "45–54", index: -0.36 }, { label: "55+", index: -0.52 },
    ],
    tags: [{ name: "dream pop", affinity: 0.94 }, { name: "synthwave", affinity: 0.88 }, { name: "bedroom pop", affinity: 0.83 }, { name: "shoegaze", affinity: 0.77 }, { name: "neo-psychedelia", affinity: 0.71 }, { name: "city pop", affinity: 0.66 }],
    trends: { series: [{ date: "2026-07-17", value: 0.41 }, { date: "2026-08-16", value: 0.46 }, { date: "2026-09-15", value: 0.52 }, { date: "2026-10-15", value: 0.59 }] },
    refs: [{ tool: "qloo_audience_demographics", cacheKey: "sample-demo" }], warnings: [],
  },
  ...SAMPLE_CITIES.flatMap((c) => call("qloo_recommend", { target_type: "brand", signal_location: `${c.name}, ${c.country}` }, 10, `brand-${c.id}`)),
  ...SAMPLE_CITIES.map((c): GatewayEvent => ({ type: "city_scored", city: c })),
  { type: "done", summary: { artist: { entityId: "sample-lumen-vale", name: "Lumen Vale" }, cities: SAMPLE_CITIES.length } },
];

// Layout-stress variant (?sample=long): same coordinates and scores, three long city names and a long artist name.
export const LONG_ARTIST_NAME = "Lumen Vale & The Extraordinarily Long Orchestra";
export const LONG_NAMES_BRIEF: TourBrief = { ...SAMPLE_BRIEF, artist: LONG_ARTIST_NAME };
const LONG_CITY_NAMES: Record<string, string> = {
  "3995465": "Santiago de Querétaro",
  "5368361": "Los Angeles–Long Beach",
  "3464975": "San Juan de los Lagos",
};
const renameCity = (c: ScoredCity): ScoredCity => {
  const name = LONG_CITY_NAMES[c.id];
  if (!name) return c;
  return { ...c, name, zones: c.zones.map((z) => ({ ...z, label: z.label.replace(c.name, name) })) };
};
export const LONG_NAMES_SAMPLE: GatewayEvent[] = LUMEN_VALE_SAMPLE.map((e): GatewayEvent => {
  switch (e.type) {
    case "resolve": return { ...e, entity: { ...e.entity, name: LONG_ARTIST_NAME } };
    case "city_scored": return { ...e, city: renameCity(e.city) };
    case "done": return { ...e, summary: { artist: { entityId: "sample-lumen-vale", name: LONG_ARTIST_NAME }, cities: SAMPLE_CITIES.length } };
    default: return e;
  }
});
