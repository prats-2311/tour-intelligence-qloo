export const MAX_TOURS_PER_OWNER = 50;
export const MAX_RUN_CHARS = 4_000_000;
export const CHUNK_CHARS = 700_000;
export const TTL_DAYS = 180;
export const TOUR_ID = /^[A-Za-z0-9_-]{8,40}$/;

export interface TourCity { id: string; name: string; country: string; verdict?: string; score?: number }
export interface OwnerDoc { createdAt: Date; lastSeenAt: Date; test?: true }
export interface TourDoc {
  ownerHash: string; title: string; status: "draft" | "final"; artist: string; artistLower: string; regions: string[]; cities: TourCity[]; search: string;
  createdAt: Date; updatedAt: Date; expiresAt: Date; runBytes: number; chunkCount: number; test?: true;
}

export class ToursError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Lowercase and strip accents ("São Paulo" becomes "sao paulo"), the same folding as the do-not-book list. */
export const foldText = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** JSON with every non-ASCII char \u-escaped (still valid JSON): one char is one UTF-8 byte, so a chunk of N chars never exceeds N bytes. */
export const serializeRun = (run: unknown): string => JSON.stringify(run).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function chunkString(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK_CHARS) out.push(s.slice(i, i + CHUNK_CHARS));
  return out.length ? out : [""];
}

const str = (v: unknown, max: number, name: string, min = 0): string => {
  if (typeof v !== "string" || v.length > max || v.trim().length < min) throw new ToursError(400, `${name} must be a string of ${min > 0 ? `${min} to ` : "at most "}${max} chars`);
  return v;
};

export interface Summary { artist: string; regions: string[]; cities: TourCity[] }

export function parseSummary(v: unknown): Summary {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ToursError(400, "summary object required");
  const s = v as Record<string, unknown>;
  const artist = str(s.artist, 120, "artist", 1).trim();
  const regionsRaw = s.regions ?? [];
  if (!Array.isArray(regionsRaw) || regionsRaw.length > 20) throw new ToursError(400, "regions must be an array of at most 20 strings");
  const regions = regionsRaw.map((r) => str(r, 80, "region"));
  if (!Array.isArray(s.cities) || s.cities.length > 40) throw new ToursError(400, "cities must be an array of at most 40");
  const cities = s.cities.map((c): TourCity => {
    if (!c || typeof c !== "object") throw new ToursError(400, "city must be an object");
    const o = c as Record<string, unknown>;
    const city: TourCity = { id: str(o.id, 80, "city id", 1), name: str(o.name, 120, "city name", 1), country: str(o.country, 120, "city country") };
    if (o.verdict !== undefined) city.verdict = str(o.verdict, 40, "verdict");
    if (o.score !== undefined) {
      if (typeof o.score !== "number" || !Number.isFinite(o.score)) throw new ToursError(400, "score must be a number");
      city.score = o.score;
    }
    return city;
  });
  return { artist, regions, cities };
}

export const parseTitle = (v: unknown): string => str(v, 120, "title", 1).trim();
export function parseStatus(v: unknown): "draft" | "final" {
  if (v !== "draft" && v !== "final") throw new ToursError(400, 'status must be "draft" or "final"');
  return v;
}

export const defaultTitle = (s: Summary): string => `${s.artist} · ${s.cities.slice(0, 3).map((c) => c.name).join(", ")}`.slice(0, 120);
export const searchText = (title: string, s: Summary): string => foldText([title, s.artist, ...s.cities.flatMap((c) => [c.name, c.country]), ...s.regions].join(" "));
