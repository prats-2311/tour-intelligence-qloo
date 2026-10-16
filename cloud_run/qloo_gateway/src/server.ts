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
import { createTavilySearch } from "./web/tavily.js";
import { FirestoreUsageStore, MemoryUsageStore } from "./web/usage.js";
import { thisWeek } from "./web/thisWeek.js";

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
const generate = project
  ? createVertexGenerate({ project, getToken: async () => String((await auth.getAccessToken()) ?? "") })
  : undefined;
const narratorModels = [process.env.GEMINI_MODEL ?? "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"];
const geminiBudget = new BudgetGuard({ perSession: 20, perDay: Number.isFinite(geminiCeiling) && geminiCeiling > 0 ? geminiCeiling : 300 });
const narrate = createNarrator({ ...(generate ? { generate } : {}), models: narratorModels, cache, ceiling: geminiBudget });

const usage = process.env.QLOO_USAGE_BACKEND === "firestore" ? new FirestoreUsageStore({ db: new Firestore() }) : new MemoryUsageStore();
const tavilyKey = process.env.TAVILY_API_KEY;
const webDeps = {
  ...(tavilyKey ? { search: createTavilySearch({ apiKey: tavilyKey }) } : {}),
  usage, cache, models: narratorModels, ceiling: geminiBudget,
  ...(generate ? { generate } : {}),
};
const app = createApp({ qloo: createQlooCaller({ mcp, cache, budget }), cities: loadCities(), health: () => mcp.health(), narrate, thisWeek: (input) => thisWeek(input, webDeps) });
const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, (err?: Error) => {
  if (err) { console.error("qloo_gateway failed to listen", err); process.exit(1); }
  console.log(`qloo_gateway listening on ${port}`);
});
process.on("SIGTERM", () => {
  server.close();
  void mcp.close().catch(() => undefined).finally(() => process.exit(0));
});