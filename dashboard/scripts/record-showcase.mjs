#!/usr/bin/env node
// Records one real Tour Board run from the deployed Qloo gateway into a JSON fixture that the
// dashboard replays at ?showcase=1. Node only, no dependencies.
//
//   QLOO_GATEWAY_URL=https://qloo-gateway-602700957663.us-central1.run.app \
//   node dashboard/scripts/record-showcase.mjs --artist "<name>" --regions "Mexico,Brazil,United States" \
//     --out dashboard/src/lib/qloo/fixtures/showcase.json [--window 2027-03-12:2027-04-18] [--max-playbooks 4]
//
// The identity token comes from `gcloud auth print-identity-token`, lives in memory only, and is never
// logged or written. Recording spends real Qloo, Vertex and Tavily quota: run it deliberately.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHORTLIST_VERDICTS = new Set(["hidden_goldmine", "play"]);
// The only tool_call arg keys the UI shows (see narrate.ts); everything else is dropped from the recording.
const VISIBLE_ARG_KEYS = ["entity", "within", "signal_location", "filter_location", "target_type", "query", "signals"];
const SECRET_KEY = /token|key|auth|secret/i;

export function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const artist = get("--artist");
  const regions = (get("--regions") ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const out = get("--out");
  if (!artist) throw new Error("--artist is required");
  if (regions.length === 0) throw new Error("--regions is required (comma separated)");
  if (!out) throw new Error("--out is required");
  const w = get("--window");
  let window;
  if (w) {
    const [start, end] = w.split(":");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "")) throw new Error("--window must be YYYY-MM-DD:YYYY-MM-DD");
    window = { start, end };
  }
  const maxPlaybooks = Math.min(4, Math.max(0, Number(get("--max-playbooks") ?? 4) || 0));
  return { artist, regions, out, ...(window ? { window } : {}), maxPlaybooks };
}

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
/** Strings, arrays of strings, and plain objects of strings and numbers survive; anything else, and any secret-looking key, does not. */
function cleanArg(v) {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.every((x) => typeof x === "string") ? [...v] : undefined;
  if (isPlain(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_KEY.test(k)) continue;
      if (typeof x === "string" || (typeof x === "number" && Number.isFinite(x))) out[k] = x;
    }
    return out;
  }
  return undefined;
}

/** tool_call args keep only the keys the UI already shows, as strings. */
export function sanitizeEvent(e) {
  if (e?.type !== "tool_call") return e;
  const args = {};
  for (const k of VISIBLE_ARG_KEYS) {
    const v = cleanArg(e.args?.[k]);
    if (v !== undefined) args[k] = v;
  }
  return { type: "tool_call", tool: e.tool, args, cached: Boolean(e.cached) };
}

async function* readSse(res) {
  const decoder = new TextDecoder();
  let buffer = "";
  const frames = () => {
    const out = [];
    let i;
    while ((i = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (data) out.push(data);
    }
    return out;
  };
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    for (const data of frames()) { try { yield JSON.parse(data); } catch { /* skip malformed frame */ } }
  }
  buffer += "\n\n";
  for (const data of frames()) { try { yield JSON.parse(data); } catch { /* skip */ } }
}

// One budget per recording: the gateway caps Qloo calls per session id, so a shared daily id starves later runs.
function makeSessionId(artist, now) {
  const slug = String(artist).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "artist";
  const rand = Array.from({ length: 6 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  return `showcase-${now.toISOString().slice(0, 10)}-${slug}-${rand}`;
}

export async function record({ artist, regions, window, maxPlaybooks = 4, gatewayUrl, token, fetchImpl = fetch, now = new Date(), sessionId = makeSessionId(artist, now), log = () => {}, warn = (m) => console.error(`warning: ${m}`) }) {
  if (!gatewayUrl) throw new Error("QLOO_GATEWAY_URL is not set");
  if (!token) throw new Error("no identity token");
  const base = gatewayUrl.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${token}`, "x-session-id": sessionId };
  // Errors name the route and status only, never a response body that could echo a header.
  const call = async (path, init) => {
    const res = await fetchImpl(`${base}${path}`, init);
    if (!res.ok) throw new Error(`${path.split("?")[0]} failed: HTTP ${res.status}`);
    return res;
  };
  const events = async (path, init) => {
    const out = [];
    for await (const e of readSse(await call(path, init))) out.push(sanitizeEvent(e));
    return out;
  };

  const brief = { artist, regions, maxStops: 8, ...(window ? { dateWindow: window } : {}) };
  log(`Recording the board for ${artist}...`);
  const boardEvents = await events("/v1/tour-board", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(brief) });
  const resolved = boardEvents.find((e) => e.type === "resolve");
  if (!resolved) throw new Error("the board did not resolve the artist (needs_input or error); nothing recorded");
  if (!boardEvents.some((e) => e.type === "done")) throw new Error("the board stream did not finish; nothing recorded");

  const cities = boardEvents.filter((e) => e.type === "city_scored").map((e) => e.city);
  let withoutQloo;
  try {
    const res = await call("/v1/without-qloo", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ artist, regions, cities: cities.map((c) => ({ name: c.name, country: c.country })) }) });
    withoutQloo = await res.json();
  } catch (err) {
    warn(`generic ranking not recorded (${err.message})`);
    withoutQloo = { status: "unavailable", reason: "error", message: "Generic ranking unavailable" };
  }
  const picks = cities
    .filter((c) => SHORTLIST_VERDICTS.has(c.verdict))
    .sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === "hidden_goldmine" ? -1 : 1) || (b.winnability.value ?? -1) - (a.winnability.value ?? -1))
    .slice(0, maxPlaybooks);

  const playbooks = {};
  const thisWeek = {};
  for (const c of picks) {
    log(`Recording the playbook for ${c.name}...`);
    const qs = new URLSearchParams({ artist, artistEntityId: resolved.entity.entityId, city: c.name, country: c.country }).toString();
    const pbEvents = await events(`/v1/city-playbook?${qs}`, { method: "GET", headers });
    if (!pbEvents.some((e) => e.type === "done") || pbEvents.at(-1)?.type === "error") {
      warn(`playbook for ${c.name} did not finish cleanly; leaving it out`);
      continue;
    }
    playbooks[c.id] = pbEvents;
    if (window) {
      const wq = new URLSearchParams({ city: c.name, country: c.country, start: window.start, end: window.end }).toString();
      thisWeek[c.id] = await (await call(`/v1/this-week?${wq}`, { method: "GET", headers })).json();
    }
  }
  return { recordedAt: now.toISOString(), artist: resolved.entity.name, brief, boardEvents, withoutQloo, playbooks, thisWeek };
}

/** One line per city: verdict, then its fan-density rank against its winnability rank. */
export function summarize(rec) {
  const cities = rec.boardEvents.filter((e) => e.type === "city_scored").map((e) => e.city).filter((c) => c.winnability.value !== null && c.fanHeat.value !== null);
  const rank = (key) => [...cities].sort((a, b) => b[key].value - a[key].value || a.name.localeCompare(b.name)).map((c) => c.id);
  const dens = rank("fanHeat");
  const win = rank("winnability");
  const lines = cities.map((c) => `${c.name} (${c.country}) ${c.verdict}: density #${dens.indexOf(c.id) + 1}, winnability #${win.indexOf(c.id) + 1}`);
  return [`${rec.artist}, recorded ${rec.recordedAt}`, ...lines, `playbooks: ${Object.keys(rec.playbooks).join(", ") || "none"}`].join("\n");
}

function identityToken() {
  return execFileSync("gcloud", ["auth", "print-identity-token"], { encoding: "utf8" }).trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rec = await record({ ...args, gatewayUrl: process.env.QLOO_GATEWAY_URL, token: identityToken(), log: (m) => console.error(m) });
  writeFileSync(args.out, `${JSON.stringify(rec, null, 1)}\n`);
  console.log(summarize(rec));
  console.error(`wrote ${args.out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`record-showcase: ${e.message}`); process.exit(1); });
}
