#!/usr/bin/env node
// Turns a real (private) Qloo recording into a synthetic one of the same shape, so tests and e2e can be
// committed to a public repo (Qloo's developer guide forbids storing Qloo response data there).
//
//   node dashboard/scripts/make-synthetic-recording.mjs <in.json> <out.json> --kind showcase|backtest
//
// Deterministic (seeded PRNG, seed 6). Keeps every key and array length, our own computed fields
// (fanHeat, activation, winnability, verdict, scoring, backtest metrics and hit flags), and geography.
// Replaces Qloo-returned entity names, ids, tags, affinity/popularity/demographic values.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX_RE = /^[0-9a-f]{32,}$/i;
const SYNTH_PREFIX = "00000000-";

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
const r2 = (v) => Math.round(v * 100) / 100;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A UUID-shaped id with the 00000000- marker prefix and a hash-derived tail; keeps the original's letter case. */
export function syntheticId(orig) {
  if (orig.toLowerCase().startsWith(SYNTH_PREFIX)) return orig;
  const h = createHash("sha256").update(`synthetic:${orig.toLowerCase()}`).digest("hex");
  const id = `${SYNTH_PREFIX}${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 24)}`;
  return /[A-F]/.test(orig) ? id.toUpperCase() : id;
}

function makeContext() {
  const rand = mulberry32(6);
  const jit = new Map();
  const counters = new Map();
  const names = new Map(); // original name -> synthetic name
  const tags = new Map();
  /** A seeded value of the same magnitude: +-0.05, memoised on the 2-decimal value so text and fields stay consistent. */
  const jitter = (v, clamp01) => {
    const key = `${clamp01 ? "c" : "u"}${r2(v)}`;
    if (!jit.has(key)) {
      const moved = r2(v) + (rand() * 2 - 1) * 0.05;
      jit.set(key, r2(clamp01 ? Math.min(1, Math.max(0, moved)) : moved));
    }
    return jit.get(key);
  };
  const number = (v, clamp01) => {
    if (typeof v !== "number") return v;
    const moved = Math.round((jitter(v, clamp01) + (v - r2(v)) * 0.9) * 1e6) / 1e6;
    return clamp01 ? Math.min(1, Math.max(0, moved)) : moved;
  };
  const nameFor = (orig, type) => {
    if (!names.has(orig)) {
      const n = (counters.get(type) ?? 0) + 1;
      counters.set(type, n);
      names.set(orig, `Synthetic ${type} ${String(n).padStart(2, "0")}`);
    }
    return names.get(orig);
  };
  const tagFor = (orig) => {
    if (!tags.has(orig)) tags.set(orig, `synthetic-tag-${String(tags.size + 1).padStart(2, "0")}`);
    return tags.get(orig);
  };
  return { jitter, number, nameFor, tagFor, names, counters, rand };
}

const CARD_TYPE = { sponsors: "Brand", merch: "Brand", talent: "Artist", co_billing: "Artist", venue_fit: "Place", local_moment: "Entity" };
const SKIP_STRING_KEYS = new Set(["type", "tool", "kind", "status", "category", "verdict", "country", "reason", "source", "concentration", "version", "model", "recordedAt", "label"]);
const QLOO_NUMBER_KEYS = new Set(["affinity", "popularity", "sharedTaste", "localAffinity", "lift"]);

function typeFromEntity(o, hint) {
  if (typeof o.category === "string" && o.category) return cap(o.category);
  if (typeof o.type === "string" && o.type.startsWith("urn:entity:")) return cap(o.type.slice("urn:entity:".length).split(/[_:]/)[0]);
  return hint ?? "Entity";
}

function showcase(input) {
  // A recorded strategist section holds real model text and Qloo-derived answers: never carried over, always rebuilt from invented text.
  if (isObj(input) && "strategist" in input) { input = { ...input }; delete input.strategist; }
  const ctx = makeContext();
  const cities = new Set();
  const collect = (node, hint, path) => {
    if (Array.isArray(node)) return node.forEach((v) => collect(v, hint, path));
    if (!isObj(node)) return;
    const p = path.join("/");
    if (typeof node.name === "string" && (p.endsWith("city") || p.endsWith("playbook/city"))) cities.add(node.name);
    if (typeof node.city === "string") cities.add(node.city);
    for (const [k, v] of Object.entries(node)) {
      let h = hint;
      if (isObj(node) && typeof node.kind === "string" && CARD_TYPE[node.kind]) h = CARD_TYPE[node.kind];
      if (k === "cards" && isObj(v)) { for (const [ck, cv] of Object.entries(v)) collect(cv, CARD_TYPE[ck] ?? hint, [...path, k, ck]); continue; }
      collect(v, h, [...path, k]);
    }
  };
  collect(input, undefined, []);
  const countries = new Set(["Mexico", "United States", "Brazil", "Canada", "Argentina", "Colombia", "Chile", "Peru", "Spain", "US", "MX", "BR"]);
  const placeLabels = new Set();
  const gatherPlaces = (node, key) => {
    if (Array.isArray(node)) return node.forEach((v) => gatherPlaces(v, key));
    if (typeof node === "string") { if (["signal_location", "filter_location", "within", "label"].includes(key)) placeLabels.add(node); return; }
    if (isObj(node)) for (const [k, v] of Object.entries(node)) gatherPlaces(v, k);
  };
  gatherPlaces(input, "");
  const isGeo = (s) => cities.has(s) || countries.has(s) || placeLabels.has(s) || (/^(.+), [A-Z]{2}$/.test(s) && cities.has(s.replace(/, [A-Z]{2}$/, "")));
  // Pass 1: every Qloo entity name, in document order (so numbering is deterministic).
  const artists = new Set();
  const gather = (node, hint, key, inEntities) => {
    if (Array.isArray(node)) return node.forEach((v) => gather(v, hint, key, key === "entities"));
    if (!isObj(node)) return;
    const h = typeof node.kind === "string" && CARD_TYPE[node.kind] ? CARD_TYPE[node.kind] : hint;
    if (typeof node.name === "string" && !isGeo(node.name) && (typeof node.entityId === "string" || inEntities || key === "entity" || key === "artist")) {
      ctx.nameFor(node.name, key === "entity" || key === "artist" ? "Artist" : typeFromEntity(node, h));
    }
    for (const [k, v] of Object.entries(node)) {
      if ((k === "artist") && typeof v === "string") ctx.nameFor(v, "Artist");
      else if (k === "entity" && typeof v === "string" && !isUuid(v) && !isGeo(v)) ctx.nameFor(v, "Artist");
      else if (k === "cards" && isObj(v)) for (const [ck, cv] of Object.entries(v)) gather(cv, CARD_TYPE[ck] ?? h, ck, false);
      else gather(v, h, k, false);
    }
  };
  gather(input, undefined, "", false);
  // The artist is "Sample Artist" everywhere.
  if (typeof input.artist === "string") ctx.names.set(input.artist, "Sample Artist");
  // Narratives sometimes re-spell a name (accents, case): match letters up to diacritics and case.
  const accents = new Map();
  for (let cp = 0xc0; cp <= 0x17f; cp++) {
    const ch = String.fromCharCode(cp);
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (base !== ch && /^[A-Za-z]$/.test(base)) accents.set(base.toLowerCase(), (accents.get(base.toLowerCase()) ?? "") + ch);
  }
  const fuzzy = (name) => [...name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")].map((c) => {
    const extra = accents.get(c.toLowerCase());
    const e = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return extra ? `[${c}${extra}]` : e;
  }).join("");
  const byFuzzy = new Map([...ctx.names].map(([k, v]) => [k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), v]));
  const sorted = [...ctx.names.keys()].sort((a, b) => b.length - a.length);
  const nameRe = sorted.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.map(fuzzy).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;

  // Zone / heat-point coordinates are Qloo where_popular locations: shift each by a seeded delta (+-0.02 deg), memoised on the
  // 3-decimal value so a point's lat/lon, its "lat, lon" label and any coordinates quoted in narrative text agree.
  const coordDelta = new Map();
  const delta = (v) => {
    const key = v.toFixed(3);
    if (!coordDelta.has(key)) coordDelta.set(key, (ctx.rand() * 2 - 1) * 0.0195);
    return coordDelta.get(key);
  };
  const COORD_RE = /-?\d{1,3}\.\d{3}(?!\d)/g;
  const shiftCoords = (text) => text.replace(COORD_RE, (m) => (coordDelta.has(parseFloat(m).toFixed(3)) ? (parseFloat(m) + coordDelta.get(parseFloat(m).toFixed(3))).toFixed(3) : m));
  const str = (s, key, path) => {
    if (key && SKIP_STRING_KEYS.has(key)) return s;
    if (isGeo(s)) return s;
    if (HEX_RE.test(s)) return syntheticId(s);
    let out = s.normalize("NFC").replace(UUID_RE, (m) => syntheticId(m));
    if (nameRe) out = out.replace(nameRe, (m) => ctx.names.get(m) ?? byFuzzy.get(m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) ?? m);
    if (key === "detail" || ((key === "text" || key === "thoughtSummary") && path.includes("narrative"))) out = shiftCoords(out);
    if ((key === "text" || key === "thoughtSummary") && path.includes("narrative")) {
      out = out.replace(/(?<![\d.])0\.\d{2}(?!\d)/g, (m) => String(ctx.jitter(parseFloat(m), true)));
    }
    return out;
  };
  // share = affinity / sum(affinity) over the zones, so recompute it from the jittered affinities; points with no
  // affinity (promo zones, a subset of those) get a seeded rescale that keeps their original total.
  const rescaleShares = (items, orig) => {
    if (items.every((z) => typeof z.affinity === "number")) {
      const total = items.reduce((a, z) => a + z.affinity, 0);
      items.forEach((z) => { z.share = total > 0 ? Math.round((z.affinity / total) * 1e9) / 1e9 : 0; });
    } else {
      const before = orig.reduce((a, z) => a + z.share, 0);
      const factors = items.map(() => 0.75 + ctx.rand() * 0.5);
      const scaled = items.map((z, i) => orig[i].share * factors[i]);
      const after = scaled.reduce((a, b) => a + b, 0);
      items.forEach((z, i) => { z.share = after > 0 ? Math.round((scaled[i] / after) * before * 1e9) / 1e9 : 0; });
    }
  };
  const walk = (node, key, path) => {
    if (typeof node === "string") return str(node, key, path);
    if (Array.isArray(node)) {
      if (key === "sharedTags") return node.map((t) => (typeof t === "string" ? ctx.tagFor(t) : t));
      const done = node.map((v) => walk(v, key, path));
      if (done.length > 0 && done.every((z) => isObj(z) && typeof z.share === "number")) rescaleShares(done, node);
      if (key === "numbers" && path.includes("narrative")) return node.map((n) => (typeof n === "number" && n > 0 && n < 1 ? ctx.jitter(n, true) : n));
      return done;
    }
    if (!isObj(node)) return node;
    const out = {};
    const isPoint = typeof node.lat === "number" && typeof node.lon === "number" && "label" in node;
    for (const [k, v] of Object.entries(node)) {
      if (k === "withoutQloo" || k === "scoring" || k === "thresholds") { out[k] = v; continue; }
      if (isPoint && (k === "lat" || k === "lon")) { out[k] = Math.round((Number(v.toFixed(3)) + delta(v)) * 1e6) / 1e6; continue; }
      if (isPoint && k === "label" && typeof v === "string") { out[k] = /^-?\d+\.\d{3}, -?\d+\.\d{3}$/.test(v) ? "" : v; continue; }
      if (typeof v === "number") {
        if (QLOO_NUMBER_KEYS.has(k)) out[k] = ctx.number(v, true);
        else if (path.includes("demographics")) out[k] = ctx.number(v, false);
        else out[k] = v;
        continue;
      }
      out[k] = walk(v, k, [...path, k]);
    }
    if (isPoint && out.label === "") out.label = `${out.lat.toFixed(3)}, ${out.lon.toFixed(3)}`;
    return out;
  };
  const result = addSyntheticStrategist(addSyntheticRouting(addSyntheticBoardCases(walk(input, "", []))));
  if (!result.withoutQloo) {
    // The recording has no generic ranking: write a clearly labelled synthetic one so the Without Qloo tab can be exercised.
    const scored = (result.boardEvents ?? []).flatMap((e) => (e.type === "city_scored" ? [{ name: e.city.name, country: e.city.country }] : []));
    result.withoutQloo = { status: "ok", ranked: scored.reverse(), model: "synthetic", cached: false };
  }
  return result;
}

/**
 * The synthetic fixture must exercise board rows the real recording has (a floored major-market seed and a city Qloo could not place),
 * which older source recordings lack. Idempotent: does nothing when the board already has such a row. Mutates and returns `rec`.
 */
export function addSyntheticBoardCases(rec) {
  const cities = (rec.boardEvents ?? []).filter((e) => e.type === "city_scored").map((e) => e.city);
  if (!cities.some((c) => c.candidateSource === "major_market")) {
    const c = cities.find((x) => x.verdict === "skip" && !x.closeCall && !(rec.playbooks ?? {})[x.id]);
    if (c) {
      c.candidateSource = "major_market";
      c.fanHeatFloor = true;
      c.verdict = "consider";
      c.winnability = { ...c.winnability, value: Math.max(c.winnability.value ?? 0, 37) };
    }
  }
  if (!cities.some((c) => c.insufficientReason === "location_unresolved")) {
    const c = cities.find((x) => x.verdict === "skip" && !x.closeCall && x.candidateSource !== "major_market" && !(rec.playbooks ?? {})[x.id]);
    if (c) {
      c.verdict = "insufficient_data";
      c.insufficientReason = "location_unresolved";
      c.activation = { value: null, reason: "insufficient_data", refs: [] };
      c.winnability = { value: null, reason: "insufficient_data", refs: [] };
    }
  }
  return rec;
}

/**
 * The synthetic fixture must also exercise the recorded "paste your cities" example (`routing`), which older source recordings lack.
 * Built only from the (already synthetic) main recording: up to 6 of its cities (the ones with playbooks first, then the rest in board
 * order) become the pasted routing, labelled `your_routing`; the last two placed ones are shown as floored (absent from the regional heat), one name
 * is "not in our city list", and the playbooks of the first two are reused. Idempotent: does nothing when `routing` already exists.
 * Mutates and returns `rec`.
 */
export function addSyntheticRouting(rec) {
  if (rec.routing) return rec;
  const events = rec.boardEvents ?? [];
  const cities = events.filter((e) => e.type === "city_scored").map((e) => e.city);
  const withBook = cities.filter((c) => (rec.playbooks ?? {})[c.id]);
  const rest = cities.filter((c) => !withBook.includes(c));
  const chosen = [...withBook.slice(0, 2), ...rest, ...withBook.slice(2)].slice(0, 6);
  if (chosen.length < 3) return rec;
  const lastTwo = new Set(chosen.filter((c) => !c.insufficientReason).slice(-2).map((c) => c.id));
  const asRouting = (c) => ({ ...structuredClone(c), candidateSource: "your_routing", ...(lastTwo.has(c.id) ? { fanHeatFloor: true } : {}) });
  const unmatched = "Atlantis";
  const boardEvents = [];
  for (const e of events) {
    if (e.type === "city_scored") continue;
    if (e.type === "done") continue;
    boardEvents.push(structuredClone(e));
    if (e.type === "scoring") boardEvents.push({ type: "routing_unmatched", names: [unmatched] });
  }
  for (const c of chosen) boardEvents.push({ type: "city_scored", city: asRouting(c) });
  boardEvents.push({ type: "done", summary: { artist: events.find((e) => e.type === "done")?.summary?.artist, cities: chosen.length } });
  const playbooks = {};
  for (const c of withBook.slice(0, 2)) playbooks[c.id] = structuredClone(rec.playbooks[c.id]);
  rec.routing = { cities: [...chosen.map((c) => ({ name: c.name, country: c.country })), { name: unmatched }], boardEvents, playbooks };
  return rec;
}

/**
 * Two invented "Ask about this tour" Q&As (the fixed final-recording questions) with a full work log: a reasoning summary, one Qloo-style
 * call per tool with a result count, and an answer. Text is made up and mentions only the synthetic cities of the board; there is no Qloo data.
 * Rebuilt every time (a source `strategist` is dropped first). Mutates and returns `rec`.
 */
export function addSyntheticStrategist(rec) {
  const names = (rec.boardEvents ?? []).filter((e) => e.type === "city_scored").map((e) => e.city.name);
  const [a = "the first market", b = "the second market"] = names;
  const turn = (question, thought, calls, answer) => ({
    question,
    events: [
      { type: "strategist_thinking", summary: thought },
      ...calls.flatMap(([id, name, args, summary], i) => [
        { type: "strategist_tool_call", id, name, args },
        { type: "strategist_tool_result", id, name, status: "ok", summary, cached: i > 0 },
      ]),
      { type: "strategist_message", text: answer, unsupportedNumbers: [], stoppedEarly: false, model: "synthetic" },
      { type: "done", summary: { rounds: 2, toolCalls: calls.length, forcedFinal: false } },
    ],
  });
  rec.strategist = [
    turn(
      "Why does Los Angeles rank above São Paulo here?",
      `Invented reasoning for the test fixture: compare the two scored markets, then check the playbook for ${a}.`,
      [["s1", "get_city_playbook", { city: a }, "7 cards"], ["s2", "qloo_recommend", { target_type: "brand", signal_location: b }, "5 results"]],
      `Invented test answer: ${a} ranks above ${b} because its sponsor fit is stronger in this fixture.`,
    ),
    turn(
      "Which sponsor should I pitch first in Mexico City, and why?",
      "Invented reasoning for the test fixture: look at sponsor fit for the market, then pick the closest match.",
      [["s1", "qloo_recommend", { target_type: "brand", signal_location: a }, "4 results"]],
      "Invented test answer: pitch the first sponsor in the list, because it matches the crowd best in this fixture.",
    ),
  ];
  return rec;
}

const ACTIVATION_TYPE = { sponsor: "Brand", merch_collab: "Brand", local_artist: "Artist" };

function backtest(input) {
  const counters = new Map();
  const next = (type) => { const n = (counters.get(type) ?? 0) + 1; counters.set(type, n); return `Synthetic ${type} ${String(n).padStart(2, "0")}`; };
  const out = structuredClone(input);
  for (const run of out.runs ?? []) {
    for (const c of run.cases ?? []) {
      const type = ACTIVATION_TYPE[c.activationType] ?? "Entity";
      const real = c.realEntity;
      if (real && typeof real.entityId === "string") real.entityId = syntheticId(real.entityId);
      for (const res of Object.values(c.results ?? {})) {
        if (!res || !Array.isArray(res.top)) continue;
        res.top = res.top.map((t, i) => {
          const hit = typeof res.rank === "number" && res.rank === i + 1;
          const name = hit ? real.name : next(type);
          const e = { name };
          if (t && typeof t.entityId === "string") e.entityId = hit && real.entityId ? real.entityId : syntheticId(t.entityId);
          return e;
        });
      }
    }
  }
  return JSON.parse(JSON.stringify(out).replace(UUID_RE, (m) => syntheticId(m)));
}

export function makeSynthetic(input, kind) {
  if (kind === "showcase") return showcase(input);
  if (kind === "backtest") return backtest(input);
  throw new Error(`unknown kind: ${kind}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inFile, outFile] = process.argv.slice(2);
  const kind = process.argv[process.argv.indexOf("--kind") + 1];
  if (!inFile || !outFile || !kind) { console.error("usage: make-synthetic-recording.mjs <in> <out> --kind showcase|backtest"); process.exit(2); }
  writeFileSync(outFile, JSON.stringify(makeSynthetic(JSON.parse(readFileSync(inFile, "utf8")), kind)) + "\n");
}
