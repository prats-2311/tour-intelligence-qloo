import type { CardClaims, CardKind, Claim, GatewayEvent, MerchDirection, Narrative, PlaybookCard, ThisWeek, ThisWeekItem } from "../types";
import { LONG_CITY_NAMES } from "./lumenVale";

// Illustrative sample data for the labelled Lumen Vale showcase. Only neighbourhood and venue names are real.
type Ent = [name: string, affinity: number, type?: string];
type Zone = [label: string, lat: number, lon: number, share: number];
type Co = [name: string, sharedTaste: number, localAffinity: number];
type ClaimRow = [text: string, refs: string[], entities: string[], numbers: number[]];
type RemovedRow = [...ClaimRow, reason: CardClaims["removed"][number]["reason"], detail: string];
type WeekRow = [text: string, date: string, citations: string[], entities: string[]];

interface CityData {
  id: string; name: string; country: string; code: string;
  sponsors: Ent[]; zones: Zone[]; local: Ent[]; venues: Ent[]; co: Co[]; proxies: Ent[]; sharedTaste: number;
  merch: MerchDirection;
  thought: string;
  claims: Partial<Record<CardKind, ClaimRow[]>>;
  removed: Partial<Record<CardKind, RemovedRow[]>>;
  week: WeekRow[];
  sources: Record<string, string>;
}

const TAGS: Ent[] = [["dream pop", 0.94], ["synthwave", 0.88], ["bedroom pop", 0.83], ["shoegaze", 0.77], ["neo-psychedelia", 0.71], ["city pop", 0.66]];
const WINDOW = { start: "2027-03-12", end: "2027-04-18" };

const ref = (tool: string, k: string) => ({ tool, cacheKey: `sample-${k}` });
const ents = (code: string, kind: string, list: Ent[]) =>
  list.map(([name, affinity, type], index) => ({ entityId: `sample-${code}-${kind}-${index}`, name, ...(type ? { type: `urn:entity:${type}`, category: type } : {}), affinity, popularity: 0.5, index }));
const claim = ([text, refs, entities, numbers]: ClaimRow): Claim =>
  ({ text, evidence_refs: refs, numbers, entities: entities.map((name) => ({ name })) });

const CITIES: CityData[] = [
  {
    id: "4005539", name: "Guadalajara", country: "MX", code: "gdl",
    sponsors: [["Cerro Alto Mezcal", 0.91], ["Brisa Vinyl Bar", 0.87], ["Ola Norte Surf Supply", 0.83], ["Casa Jícara Coffee", 0.81], ["Tejido Studio", 0.78], ["Lúpulo Tapatío", 0.74], ["Papel Norte Stationery", 0.71], ["Marea Cold Brew", 0.69], ["Sombra Eyewear", 0.66], ["Ruta 23 Bikes", 0.63]],
    zones: [["Colonia Americana", 20.6736, -103.3653, 0.38], ["Chapultepec", 20.6720, -103.3730, 0.26], ["Providencia", 20.6930, -103.3880, 0.17], ["Zapopan Centro", 20.7214, -103.3916, 0.09], ["Tlaquepaque", 20.6409, -103.3127, 0.06]],
    local: [["Bruma Nocturna", 0.88, "artist"], ["Cine Foro", 0.84, "place"], ["Mercado San Juan de Dios", 0.80, "place"]],
    venues: [["C3 Stage", 0.91], ["Teatro Diana", 0.86], ["Foro Independencia", 0.79]],
    co: [["Bruma Nocturna", 0.34, 0.88], ["Sala Cóndor", 0.29, 0.81], ["Hilo Rojo", 0.22, 0.74]],
    proxies: [["Los Arcos del Sur", 0.69], ["Banda Altamira", 0.66], ["Clara Sol", 0.61]], sharedTaste: 0.12,
    merch: { title: "Jacaranda season", palette: ["lilac", "bone"], motifs: ["papel-picado line motif"], products: ["heavyweight boxy tee", "tote"] },
    thought: "Sponsor fit is high and concentrated in a few brands; fan heat sits in three adjacent colonias, so posters and the venue can share one walkable zone.",
    claims: {
      sponsors: [["Cerro Alto Mezcal is the strongest sponsor fit at 0.91.", ["sponsors:0"], ["Cerro Alto Mezcal"], [0.91]], ["Brisa Vinyl Bar follows at 0.87.", ["sponsors:1"], ["Brisa Vinyl Bar"], [0.87]]],
      promo_zones: [["Colonia Americana holds 38% of in-city fan heat.", ["promo_zones:0"], ["Colonia Americana"], [38]], ["Chapultepec adds another 26%.", ["promo_zones:1"], ["Chapultepec"], [26]]],
      venue_fit: [["C3 Stage ranks first for crowd fit at 0.91.", ["venue_fit:0"], ["C3 Stage"], [0.91]]],
      co_billing: [["Bruma Nocturna gives the best co-bill lift, 0.34 shared taste × 0.88 local affinity.", ["co_billing:0"], ["Bruma Nocturna"], [0.34, 0.88]]],
      local_moment: [["Fans here also love Bruma Nocturna (0.88).", ["local_moment:0"], ["Bruma Nocturna"], [0.88]]],
    },
    removed: {
      sponsors: [["Cerro Alto Mezcal fits at 0.93.", ["sponsors:0"], ["Cerro Alto Mezcal"], [0.93], "unsupported_number", "0.93"]],
      venue_fit: [["Foro Alameda is an alternative room.", ["venue_fit:0"], ["Foro Alameda"], [], "unsupported_entity", "Foro Alameda"]],
    },
    week: [
      ["Film festival week in the city, 13–19 Mar", "2027-03-13", ["w1", "w2"], ["Guadalajara film festival"]],
      ["Long weekend: Benito Juárez holiday observed 15 Mar", "2027-03-15", ["w3"], ["Benito Juárez holiday"]],
      ["No rival 1,000–2,500 cap show listed for 14 Mar", "2027-03-14", ["w4"], ["Guadalajara rival listings"]],
    ],
    sources: { w1: "Guadalajara film festival, 13–19 Mar", w2: "Guadalajara film festival programme", w3: "Benito Juárez holiday observed 15 Mar", w4: "Guadalajara rival listings for 14 Mar, 1,000–2,500 cap shows" },
  },
  {
    id: "3464975", name: "Curitiba", country: "BR", code: "cwb",
    sponsors: [["Pinhão Roasters", 0.86], ["Araucária Records", 0.82], ["Garoa Outerwear", 0.80], ["Mate Leve", 0.76], ["Bonde Bikes", 0.71]],
    zones: [],
    local: [["Neblina Azul", 0.84, "artist"], ["Ópera de Arame", 0.81, "place"], ["Jardim Botânico de Curitiba", 0.78, "place"]],
    venues: [["Ópera de Arame", 0.82], ["Teatro Guaíra", 0.79], ["Tork n' Roll", 0.74]],
    co: [["Neblina Azul", 0.31, 0.84], ["Sala Fria", 0.27, 0.77]],
    proxies: [["Banda Paraná", 0.64], ["Duo Capivara", 0.58]], sharedTaste: 0.15,
    merch: { title: "Garoa", palette: ["lagoon", "bone"], motifs: ["araucária pine silhouette"], products: ["rain shell", "tote"] },
    thought: "Activation is strong but Qloo returned no neighbourhood heat, so promo zoning has to wait for a wider query; venues and sponsors carry the plan.",
    claims: {
      sponsors: [["Pinhão Roasters leads sponsor fit at 0.86.", ["sponsors:0"], ["Pinhão Roasters"], [0.86]]],
      venue_fit: [["Ópera de Arame is the best crowd fit at 0.82.", ["venue_fit:0"], ["Ópera de Arame"], [0.82]]],
      co_billing: [["Neblina Azul is the strongest support act, 0.31 shared taste × 0.84 local affinity.", ["co_billing:0"], ["Neblina Azul"], [0.31, 0.84]]],
      local_moment: [["Fans here also love Neblina Azul (0.84).", ["local_moment:0"], ["Neblina Azul"], [0.84]]],
      talent: [["Shared taste with the city's mainstream is low at 0.15, so lean into the niche.", ["talent:sharedTaste"], [], [0.15]]],
    },
    removed: {
      sponsors: [["Garoa Outerwear is the top sponsor.", ["sponsors:9"], ["Garoa Outerwear"], [], "dangling_ref", "sponsors:9"]],
    },
    week: [["City theatre festival runs 24 Mar – 5 Apr", "2027-03-24", ["w1"], ["Curitiba theatre festival"]]],
    sources: { w1: "Curitiba theatre festival, 24 Mar – 5 Apr" },
  },
  {
    id: "3530597", name: "Mexico City", country: "MX", code: "cdmx",
    sponsors: [["Tinta Roja Mezcal", 0.83], ["Neón Records", 0.81], ["Café Ámbar", 0.78], ["Volcán Skate", 0.76], ["Lienzo Studio", 0.72]],
    zones: [["Roma Norte", 19.4194, -99.1617, 0.31], ["Condesa", 19.4111, -99.1733, 0.24], ["Coyoacán", 19.3500, -99.1617, 0.15], ["Juárez", 19.4270, -99.1580, 0.12], ["Narvarte", 19.3960, -99.1520, 0.08]],
    local: [["Eco Lunar", 0.81, "artist"], ["Cineteca Nacional", 0.79, "place"], ["Mercado Roma", 0.75, "place"]],
    venues: [["Foro Indie Rocks", 0.80], ["Lunario", 0.77], ["Teatro Metropólitan", 0.72]],
    co: [["Eco Lunar", 0.30, 0.81], ["Mar de Fondo", 0.26, 0.78]],
    proxies: [["Grupo Centella", 0.67], ["Rayo Norte", 0.60]], sharedTaste: 0.10,
    merch: { title: "Ciudad de neón", palette: ["vermilion", "bone"], motifs: ["metro-map lines"], products: ["long-sleeve tee", "poster"] },
    thought: "The largest market; fan heat spreads across Roma Norte and Condesa, and the venue shortlist favours mid-size rooms.",
    claims: {
      sponsors: [["Tinta Roja Mezcal leads sponsor fit at 0.83.", ["sponsors:0"], ["Tinta Roja Mezcal"], [0.83]]],
      promo_zones: [["Roma Norte holds 31% of in-city fan heat.", ["promo_zones:0"], ["Roma Norte"], [31]], ["Condesa adds 24%.", ["promo_zones:1"], ["Condesa"], [24]]],
      venue_fit: [["Foro Indie Rocks ranks first at 0.80.", ["venue_fit:0"], ["Foro Indie Rocks"], [0.80]]],
      co_billing: [["Eco Lunar gives the best co-bill lift, 0.30 × 0.81.", ["co_billing:0"], ["Eco Lunar"], [0.30, 0.81]]],
      talent: [["Shared taste with the city's mainstream is 0.10.", ["talent:sharedTaste"], [], [0.10]]],
    },
    removed: {
      local_moment: [["Fans here love Café Tacuba.", ["local_moment:0"], ["Café Tacuba"], [], "unsupported_entity", "Café Tacuba"]],
    },
    week: [
      ["Large rock festival weekend, 13–14 Mar", "2027-03-13", ["w1"], ["Mexico City rock festival"]],
      ["Benito Juárez holiday observed 15 Mar", "2027-03-15", ["w2"], ["Benito Juárez holiday"]],
    ],
    sources: { w1: "Mexico City rock festival, 13–14 Mar", w2: "Benito Juárez holiday observed 15 Mar" },
  },
  {
    id: "3448439", name: "São Paulo", country: "BR", code: "sp",
    sponsors: [["Paulista Vinyl", 0.79], ["Bruma Cold Brew", 0.75], ["Concreto Skate", 0.72], ["Ipê Studio", 0.70], ["Sereno Beer", 0.66]],
    zones: [["Pinheiros", -23.5670, -46.6930, 0.29], ["Vila Madalena", -23.5530, -46.6900, 0.23], ["Consolação", -23.5510, -46.6600, 0.16], ["Bela Vista", -23.5610, -46.6480, 0.11], ["Barra Funda", -23.5260, -46.6660, 0.07]],
    local: [["Céu Aberto", 0.78, "artist"], ["Cinemateca Brasileira", 0.76, "place"], ["Mercado de Pinheiros", 0.72, "place"]],
    venues: [["Cine Joia", 0.78], ["Audio", 0.74], ["Casa Natura Musical", 0.71]],
    co: [["Céu Aberto", 0.28, 0.78], ["Linha Sete", 0.24, 0.73]],
    proxies: [["Trio Avenida", 0.63], ["Samba Leve", 0.57]], sharedTaste: 0.09,
    merch: { title: "Garoa paulistana", palette: ["pitch green", "bone"], motifs: ["Copan building curves"], products: ["tee", "bucket hat"] },
    thought: "Heat clusters in Pinheiros and Vila Madalena; sponsor fit is moderate, so co-billing carries more of the plan.",
    claims: {
      sponsors: [["Paulista Vinyl leads sponsor fit at 0.79.", ["sponsors:0"], ["Paulista Vinyl"], [0.79]]],
      promo_zones: [["Pinheiros holds 29% of in-city fan heat.", ["promo_zones:0"], ["Pinheiros"], [29]]],
      venue_fit: [["Cine Joia ranks first at 0.78.", ["venue_fit:0"], ["Cine Joia"], [0.78]]],
      co_billing: [["Céu Aberto gives the best co-bill lift, 0.28 × 0.78.", ["co_billing:0"], ["Céu Aberto"], [0.28, 0.78]]],
      local_moment: [["Fans here also love Cinemateca Brasileira (0.76).", ["local_moment:1"], ["Cinemateca Brasileira"], [0.76]]],
    },
    removed: {},
    week: [["Major festival weekend, 26–28 Mar", "2027-03-26", ["w1"], ["São Paulo festival weekend"]]],
    sources: { w1: "São Paulo festival weekend, 26–28 Mar" },
  },
];

const byId = (id: string): CityData | undefined => CITIES.find((c) => c.id === id);

function cardsFor(c: CityData): PlaybookCard[] {
  const k = (n: string) => `${c.code}-${n}`;
  const co = c.co
    .map(([name, sharedTaste, localAffinity], i) => ({ name, entityId: `sample-${c.code}-co-${i}`, sharedTaste, localAffinity, lift: Math.round(sharedTaste * localAffinity * 10000) / 10000, sharedTags: TAGS.slice(i % 3, (i % 3) + 3).map(([t]) => t), ref: ref("qloo_compare_audiences", `${c.code}-co-${i}`) }))
    .sort((a, b) => b.lift - a.lift);
  const zones = c.zones.map(([label, lat, lon, share], index) => ({ label, lat, lon, affinity: share, index, share }));
  return [
    { kind: "sponsors", status: "ok", items: ents(c.code, "sponsor", c.sponsors), refs: [ref("qloo_recommend", k("1"))], warnings: [] },
    { kind: "merch", status: "ok", items: ents(c.code, "tag", TAGS), refs: [ref("qloo_entity_tags", k("tags"))], warnings: [] },
    zones.length
      ? { kind: "promo_zones", status: "ok", items: zones, refs: [ref("qloo_where_popular", k("zones"))], warnings: [] }
      : { kind: "promo_zones", status: "empty", items: [], refs: [ref("qloo_where_popular", k("zones"))], warnings: [] },
    { kind: "local_moment", status: "ok", items: ents(c.code, "local", c.local), refs: [ref("qloo_recommend", k("2"))], warnings: [] },
    { kind: "venue_fit", status: "ok", items: ents(c.code, "venue", c.venues), refs: [ref("qloo_rank", k("rank"))], warnings: [] },
    { kind: "co_billing", status: "ok", items: co, refs: c.co.map((_, i) => ref("qloo_compare_audiences", k(`co-${i}`))), warnings: [] },
    { kind: "talent", status: "ok", items: ents(c.code, "talent", c.proxies), refs: [ref("qloo_recommend", k("3"))], warnings: [], summary: { sharedTaste: c.sharedTaste, sharedTags: TAGS.slice(0, 3).map(([t]) => t) } },
  ];
}

function narrativeFor(c: CityData): Narrative {
  const cards: Partial<Record<CardKind, CardClaims>> = {};
  for (const kind of new Set([...Object.keys(c.claims), ...Object.keys(c.removed)]) as Set<CardKind>) {
    cards[kind] = {
      verified: (c.claims[kind] ?? []).map(claim),
      removed: (c.removed[kind] ?? []).map((row) => ({ claim: claim(row.slice(0, 4) as ClaimRow), reason: row[4] as RemovedRow[4], detail: row[5] as string })),
    };
  }
  return { status: "ok", model: "sample", thoughtSummary: c.thought, cards, merch: c.merch, cached: true };
}

function eventsFor(c: CityData): GatewayEvent[] {
  const n = (i: number) => `sample-${c.code}-${i}`;
  const pair = (tool: string, args: Record<string, unknown>, i: number, status: "ok" | "empty" = "ok", count = 10): GatewayEvent[] => [
    { type: "tool_call", tool, args, cached: true },
    { type: "tool_result", tool, status, resultCount: count, cacheKey: n(i), stale: false },
  ];
  const place = `${c.name}, ${c.country}`;
  let i = 0;
  return [
    ...(["brand", "place", "artist", "place", "movie"] as const).flatMap((t) => pair("qloo_recommend", { target_type: t, signal_location: place }, ++i)),
    ...pair("qloo_where_popular", { within: place }, ++i, c.zones.length ? "ok" : "empty", c.zones.length),
    ...pair("qloo_rank", { candidates: c.venues.map((v) => v[0]) }, ++i, "ok", c.venues.length),
    ...Array.from({ length: c.co.length + 1 }, () => pair("qloo_compare_audiences", { group_a: ["sample-lumen-vale"], group_b: [place] }, ++i, "ok", 6)).flat(),
    ...pair("qloo_entity_tags", { entities: ["sample-lumen-vale"] }, ++i, "ok", TAGS.length),
    { type: "playbook", playbook: { city: { name: c.name, country: c.country }, cards: cardsFor(c) } },
    { type: "narrative", narrative: narrativeFor(c) },
    { type: "done", summary: { city: c.name } },
  ];
}

function thisWeekFor(c: CityData): ThisWeek {
  const urlOf = (id: string) => `https://example.com/sample/${c.code}-${id.slice(1)}`;
  const items: ThisWeekItem[] = c.week.map(([text, date, citations, entities]) => ({ text, date, entities, citations }));
  const ids = [...new Set(items.flatMap((it) => it.citations))];
  return {
    status: "ok", window: WINDOW, items, removed: [], summarised: true, cached: true,
    citations: ids.map((id) => ({ id, url: urlOf(id), title: `Sample source — ${c.sources[id]}` })),
  };
}

export const SAMPLE_PLAYBOOK_CITY_IDS = ["3530597", "3448439", "4005539", "3464975"] as const;

export function samplePlaybookEvents(cityId: string, opts: { long?: boolean } = {}): GatewayEvent[] | null {
  const c = byId(cityId);
  if (!c) return null;
  const events = eventsFor(c);
  const longName = opts.long ? LONG_CITY_NAMES[cityId] : undefined;
  if (!longName) return events;
  return events.map((e): GatewayEvent => (e.type === "playbook" ? { ...e, playbook: { ...e.playbook, city: { ...e.playbook.city, name: longName } } } : e));
}

export function sampleThisWeek(cityId: string): ThisWeek | null {
  const c = byId(cityId);
  return c ? thisWeekFor(c) : null;
}
