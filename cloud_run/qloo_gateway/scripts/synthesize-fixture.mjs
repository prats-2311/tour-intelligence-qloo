#!/usr/bin/env node
// Turns a real (private) Qloo API response into a synthetic one of the same shape, so gateway tests can be
// committed to a public repo (Qloo's developer guide forbids storing Qloo response data there).
//
//   node scripts/synthesize-fixture.mjs <in.json> <out.json>
//
// Deterministic (seeded PRNG, seed 6). Keeps every key, array length, status/contract fields, urn:tag taxonomy
// prefixes, geography (coordinates, city/country) and exact 0/1 values. Replaces Qloo-returned entity names,
// ids (00000000- prefix, same case as the original), tag names/leaf ids, descriptions, addresses, image urls
// and jitters affinity/popularity/score/demographic values by at most 0.04. Reuses syntheticId() from the
// dashboard generator so ids look the same across the repo.
import { readFileSync, writeFileSync } from "node:fs";
import { syntheticId } from "../../../dashboard/scripts/make-synthetic-recording.mjs";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const NUMBER_KEYS = new Set(["popularity", "affinity", "score", "affinity_rank", "entity_artist_affinity", "entity_artist_affinity_rank", "business_rating",
  "24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older", "male", "female"]);
const TEXT_KEYS = { description: "Synthetic description.", short_description: "Synthetic short description.", address: "Synthetic address" };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesizeFixture(input) {
  const rand = mulberry32(6);
  const names = new Map(); // original name -> synthetic
  const counters = new Map();
  const tagIds = new Map();
  const nameFor = (orig, type) => {
    if (!names.has(orig)) {
      const n = (counters.get(type) ?? 0) + 1;
      counters.set(type, n);
      names.set(orig, `Synthetic ${type} ${String(n).padStart(2, "0")}`);
    }
    return names.get(orig);
  };
  const typeOf = (o) => {
    const t = o.subtype ?? o.type;
    if (typeof t === "string" && t.startsWith("urn:tag")) return "Tag";
    if (typeof t === "string" && t.startsWith("urn:entity:")) return cap(t.slice("urn:entity:".length).split(/[_:]/)[0]);
    return "Entity";
  };
  const tagIdFor = (orig) => {
    if (!tagIds.has(orig)) {
      const parts = orig.split(":");
      parts[parts.length - 1] = `synthetic-tag-${String(tagIds.size + 1).padStart(2, "0")}`;
      tagIds.set(orig, parts.join(":"));
    }
    return tagIds.get(orig);
  };
  // Pass 1: names, in document order.
  const gather = (n) => {
    if (Array.isArray(n)) return n.forEach(gather);
    if (!isObj(n)) return;
    if (typeof n.name === "string" && ["entity_id", "id", "tag_id", "subtype", "type", "entityId"].some((k) => k in n)) nameFor(n.name, typeOf(n));
    Object.values(n).forEach(gather);
  };
  gather(input);
  const sorted = [...names.keys()].sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = sorted.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "gu") : null;

  const str = (s, key) => {
    if (key in TEXT_KEYS) return TEXT_KEYS[key];
    if (s.startsWith("urn:tag:") && s.split(":").length > 3 && (key === "tag_id" || key === "id")) return tagIdFor(s);
    if (/^https?:\/\/images\.qloo\.com\//.test(s)) return "https://example.invalid/synthetic.jpg";
    let out = s.replace(UUID_RE, (m) => syntheticId(m));
    if (nameRe) out = out.replace(nameRe, (m) => names.get(m) ?? m);
    return out;
  };
  const num = (v) => {
    if (v === 0 || v === 1) return v;
    const moved = r6(v + (rand() * 2 - 1) * 0.04);
    return Math.min(1, Math.max(v < 0 ? -1 : 0, moved));
  };
  const walk = (n, key, parent) => {
    if (typeof n === "string") return str(n, key);
    if (Array.isArray(n)) return n.map((v) => walk(v, key, parent));
    if (!isObj(n)) return typeof n === "number" && NUMBER_KEYS.has(key) ? num(n) : n;
    const out = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === "name" && typeof v === "string" && names.has(v)) out[k] = names.get(v);
      else if (k === "name" && key === "geocode") out[k] = "Synthetic district";
      else if (typeof v === "number") out[k] = NUMBER_KEYS.has(k) ? num(v) : v;
      else out[k] = walk(v, k === "geocode" ? "geocode" : k, n);
    }
    return out;
  };
  return walk(input, "", null);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inFile, outFile] = process.argv.slice(2);
  if (!inFile || !outFile) { console.error("usage: synthesize-fixture.mjs <in.json> <out.json>"); process.exit(2); }
  writeFileSync(outFile, JSON.stringify(synthesizeFixture(JSON.parse(readFileSync(inFile, "utf8"))), null, 2) + "\n");
}
