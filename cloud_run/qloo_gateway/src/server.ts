import { Firestore } from "@google-cloud/firestore";
import { BudgetGuard } from "./budget.js";
import { FirestoreCache, MemoryCache, TieredCache } from "./cache.js";
import { loadCities } from "./geo/cities.js";
import { createApp } from "./http/app.js";
import { QlooMcpClient, defaultFactory } from "./mcpClient.js";
import { createQlooCaller } from "./qlooCall.js";
import { GoogleAuth } from "google-auth-library";
import { createVertexGenerate } from "./narrative/gemini.js";
import { createNarrator } from "./narrative/narrate.js";

const mcp = new QlooMcpClient({ factory: defaultFactory });
const l1 = new MemoryCache();
const cache = process.env.QLOO_CACHE_BACKEND === "firestore"
  ? new TieredCache({ l1, l2: new FirestoreCache({ db: new Firestore() }) })
  : l1;
const ceiling = Number(process.env.QLOO_DAILY_CEILING);
const budget = new BudgetGuard({ perSession: 100, perDay: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : 2000 });
const project = process.env.GOOGLE_CLOUD_PROJECT;
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const geminiCeiling = Number(process.env.GEMINI_DAILY_CEILING);
const narrate = createNarrator({
  ...(project ? { generate: createVertexGenerate({ project, getToken: async () => String((await auth.getAccessToken()) ?? "") }) } : {}),
  models: [process.env.GEMINI_MODEL ?? "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"],
  cache,
  ceiling: new BudgetGuard({ perSession: 20, perDay: Number.isFinite(geminiCeiling) && geminiCeiling > 0 ? geminiCeiling : 300 }),
});
const app = createApp({ qloo: createQlooCaller({ mcp, cache, budget }), cities: loadCities(), health: () => mcp.health(), narrate });
const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, (err?: Error) => {
  if (err) { console.error("qloo_gateway failed to listen", err); process.exit(1); }
  console.log(`qloo_gateway listening on ${port}`);
});
process.on("SIGTERM", () => {
  server.close();
  void mcp.close().catch(() => undefined).finally(() => process.exit(0));
});