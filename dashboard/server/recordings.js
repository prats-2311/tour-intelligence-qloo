import { readFile as fsReadFile } from "node:fs/promises";

// The Qloo developer guide forbids storing Qloo response data in a public repo, so the real showcase and
// backtest recordings live outside git: a private GCS bucket in prod, a local private-data/ dir in dev.
const NAMES = new Set(["showcase", "backtest"]);
const TTL_MS = 5 * 60_000;

export function mountRecordings(
  app,
  {
    bucket = process.env.RECORDINGS_BUCKET,
    localDir = process.env.RECORDINGS_DIR,
    fetchImpl = fetch,
    getAccessToken,
    readFile = fsReadFile,
    now = Date.now,
  } = {},
) {
  const memo = new Map();
  const send = (res, body) => res.set("cache-control", "public, max-age=300").type("application/json").send(body);
  app.get("/api/recordings/:name", async (req, res) => {
    const name = req.params.name;
    if (!NAMES.has(name)) return res.status(404).json({ error: "unknown recording" });
    const hit = memo.get(name);
    if (hit && now() - hit.at < TTL_MS) return send(res, hit.body);
    try {
      let body;
      if (localDir) body = await readFile(`${localDir}/${name}.json`, "utf8");
      else if (bucket) {
        const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(`${name}.json`)}?alt=media`;
        const get = async (token) => fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
        let r = await get(await getAccessToken());
        // A cached token can expire before its cache entry does: refresh once and retry.
        if (r.status === 401 || r.status === 403) r = await get(await getAccessToken({ force: true }));
        if (!r.ok) throw new Error(`storage returned ${r.status}`);
        body = await r.text();
      } else throw new Error("no recordings source configured");
      JSON.parse(body); // never serve a corrupt file
      memo.set(name, { at: now(), body });
      send(res, body);
    } catch (err) {
      console.error("[recordings]", name, err?.message ?? String(err));
      res.status(503).json({ error: "recording unavailable" });
    }
  });
}
