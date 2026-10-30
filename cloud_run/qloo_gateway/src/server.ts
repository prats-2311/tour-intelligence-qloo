import { Firestore } from "@google-cloud/firestore";
import { BudgetGuard, FirestoreDailyCountStore, SESSION_QLOO_BUDGET } from "./budget.js";
import { FirestoreCache, MemoryCache, TieredCache } from "./cache.js";
import { loadCities } from "./geo/cities.js";
import { createApp } from "./http/app.js";
import { rankWithoutQloo } from "./withoutQloo.js";
import { compareSponsorsWithoutQloo } from "./sponsorsWithoutQloo.js";
import { runStrategist } from "./strategist/run.js";
import { QlooMcpClient, defaultFactory } from "./mcpClient.js";
import { createQlooCaller } from "./qlooCall.js";
import { GoogleAuth } from "google-auth-library";
import { createNarrator } from "./narrative/narrate.js";
import { createTavilySearch } from "./web/tavily.js";
import { FirestoreUsageStore, MemoryUsageStore } from "./web/usage.js";
import { suggestLocalActs } from "./pipeline/localActs.js";
import { classifySponsors } from "./pipeline/sponsorCheck.js";
import { advance } from "./web/advance.js";
import { thisWeek } from "./web/thisWeek.js";
import { FirestoreCollabStore, MemoryCollabStore } from "./collab/store.js";
import { logQlooBaseUrl } from "./startupLog.js";
import { selectGenerate } from "./narrative/provider.js";
import { findOnPath, startupStatus } from "./startupStatus.js";
import { createAnalytics } from "./analytics/bigquery.js";

logQlooBaseUrl(process.env);

const mcp = new QlooMcpClient({ factory: defaultFactory });
const l1 = new MemoryCache();
const cache = process.env.QLOO_CACHE_BACKEND === "firestore"
  ? new TieredCache({ l1, l2: new FirestoreCache({ db: new Firestore() }) })
  : l1;
const ceiling = Number(process.env.QLOO_DAILY_CEILING);
const publicCeiling = Number(process.env.QLOO_PUBLIC_DAILY_CEILING);
// Per-session and public counts stay in memory; the global daily count is persisted (qloo_usage/<YYYY-MM-DD>) so restarts and extra instances share it.
const budget = new BudgetGuard({
  ...(process.env.QLOO_USAGE_BACKEND === "firestore" ? { dailyStore: new FirestoreDailyCountStore({ db: new Firestore() }) } : {}),
  perSession: SESSION_QLOO_BUDGET, perDay: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : 2000,
  ...(Number.isFinite(publicCeiling) && publicCeiling > 0 ? { publicPerDay: publicCeiling } : {}),
});
const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const geminiCeiling = Number(process.env.GEMINI_DAILY_CEILING);
const selected = selectGenerate(process.env, { getToken: async () => String((await auth.getAccessToken()) ?? "") });
const generate = selected.generate;
for (const line of startupStatus(process.env, selected, { harnessFound: !!findOnPath(process.env.QLOO_BIN ?? "qloo", process.env.PATH) })) console.log(`qloo_gateway ${line}`);
const narratorModels = [process.env.GEMINI_MODEL ?? "gemini-3.8-flash", process.env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash"];
// Per-session limit is in memory; the daily count is persisted (gemini_usage/<YYYY-MM>) so restarts and extra instances share it.
const geminiBudget = new BudgetGuard({ perSession: 20, perDay: Number.MAX_SAFE_INTEGER });
const geminiCaps = { perDay: Number.isFinite(geminiCeiling) && geminiCeiling > 0 ? geminiCeiling : 300, perMonth: 20_000 };
const firestoreUsage = process.env.QLOO_USAGE_BACKEND === "firestore";
const dailyUsage = firestoreUsage ? new FirestoreUsageStore({ db: new Firestore(), prefix: "gemini_usage", caps: geminiCaps }) : new MemoryUsageStore(geminiCaps);
const narrate = createNarrator({ ...(generate ? { generate } : {}), models: narratorModels, cache, ceiling: geminiBudget, dailyUsage });

const usage = firestoreUsage ? new FirestoreUsageStore({ db: new Firestore() }) : new MemoryUsageStore();
const tavilyKey = process.env.TAVILY_API_KEY;
const webDeps = {
  ...(tavilyKey ? { search: createTavilySearch({ apiKey: tavilyKey }) } : {}),
  usage, cache, models: narratorModels, ceiling: geminiBudget, dailyUsage,
  ...(generate ? { generate } : {}),
};
// Team workspaces: one Firestore doc each (collab_workspaces/<ws>); the operator enables a TTL policy on `expiresAt`.
const collabStore = firestoreUsage ? new FirestoreCollabStore({ db: new Firestore() }) : new MemoryCollabStore();
const qlooCaller = createQlooCaller({ mcp, cache, budget });
const cities = loadCities();
// Optional BigQuery analytics: on only when BQ_DATASET (and GOOGLE_CLOUD_PROJECT) are set; otherwise a no-op.
const analytics = createAnalytics(process.env);
if (analytics.enabled) console.log(`analytics: BigQuery dataset ${analytics.dataset}`);
const app = createApp({
  qloo: qlooCaller, cities, analytics, collab: { store: collabStore }, health: () => mcp.health(), narrate, thisWeek: (input) => thisWeek(input, webDeps), advance: (input) => advance(input, webDeps),
  localActs: (input) => suggestLocalActs(input, { ...(generate ? { generate } : {}), models: narratorModels, ceiling: { ceiling: geminiBudget, dailyUsage }, cache }),
  sponsorCheck: (candidates, sessionId) => classifySponsors(candidates, sessionId, { ...(generate ? { generate } : {}), models: narratorModels, ceiling: { ceiling: geminiBudget, dailyUsage }, cache }),
  withoutQloo: (input) => rankWithoutQloo(input, { ...(generate ? { generate } : {}), models: narratorModels, ceiling: { ceiling: geminiBudget, dailyUsage }, cache }),
  sponsorsWithoutQloo: (input, signal) => compareSponsorsWithoutQloo(input, { qloo: qlooCaller, cities, ...(generate ? { generate } : {}), models: narratorModels, ceiling: { ceiling: geminiBudget, dailyUsage }, cache, signal }),
  strategist: (input, signal) => runStrategist(input, { generate, models: narratorModels, ceiling: { ceiling: geminiBudget, dailyUsage }, qloo: qlooCaller, cities, signal }),
});
const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, (err?: Error) => {
  if (err) { console.error("qloo_gateway failed to listen", err); process.exit(1); }
  console.log(`qloo_gateway listening on ${port}`);
});
process.on("SIGTERM", () => {
  server.close();
  void analytics.flush().catch(() => undefined);
  void mcp.close().catch(() => undefined).finally(() => process.exit(0));
});