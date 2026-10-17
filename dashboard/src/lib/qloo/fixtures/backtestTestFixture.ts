import type { BacktestRun, CaseResult } from "../backtest";

const top = (...names: string[]) => names.map((name) => ({ name }));

const cases: CaseResult[] = [
  {
    id: "synth-sponsor", artist: "Test Artist", city: "Testville", country: "Testland",
    activationType: "sponsor", decision: "Which sponsor to pitch",
    realEntity: { name: "Alpha Beverages", entityId: "E1", resolved: true },
    date: "2024-05", sources: ["https://www.example.com/a/story"], summary: "Alpha Beverages sponsored the Testville show.",
    results: {
      qloo_playbook: { status: "ok", rank: 2, top: top("X", "Alpha Beverages") },
      city_popularity: { status: "ok", rank: 14, top: top("Y") },
      llm_only: { status: "ok", rank: null, top: top("Z") },
    },
  },
  {
    id: "synth-merch", artist: "Test Artist", city: "Merchburg", country: "Testland",
    activationType: "merch_collab", decision: "The merch angle",
    realEntity: { name: "Beta Apparel", entityId: "E2", resolved: true },
    date: "2023-11", sources: ["https://news.example.org/b"], summary: "Beta Apparel made a tour capsule for Merchburg.",
    results: {
      qloo_playbook: { status: "ok", rank: null, top: top("X") },
      city_popularity: { status: "ok", rank: 3, top: top("Beta Apparel") },
      llm_only: { status: "unavailable", reason: "llm_unavailable" },
    },
  },
  {
    id: "synth-local", artist: "Test Artist", city: "Localton", country: "Testland",
    activationType: "local_artist", decision: "Who goes on the bill",
    realEntity: { name: "The Very Long Named Local Ensemble of the Northern Harbour District Collective", entityId: null, resolved: false },
    date: "2022-08",
    sources: ["https://a-very-long-subdomain.example-news-site.com/p/1", "https://www.example.net/2", "https://blog.example.io/3", "https://example.dev/4"],
    summary: "A local act opened the Localton show.",
    results: {
      qloo_playbook: { status: "ok", rank: 9, top: top("Q"), note: "rank_unavailable" },
      city_popularity: { status: "ok", rank: null, top: top("R") },
      llm_only: { status: "ok", rank: null, top: top("S") },
    },
  },
];

export const run1Fixture: BacktestRun = {
  schemaVersion: 1, status: "complete", runAt: "2026-10-16T10:00:00.000Z", model: "gemini-test",
  method: "v1", methodNote: "Run 1 playbook used the artist's fans' taste neighbours.",
  cutoff: 10, wideCutoff: 20, methods: ["qloo_playbook", "city_popularity", "llm_only"],
  n: 3, cases,
  summary: {
    qloo_playbook: { scored: 3, hit10: 2, hit20: 2 },
    city_popularity: { scored: 3, hit10: 1, hit20: 1 },
    llm_only: { scored: 2, hit10: 0, hit20: 0 },
  },
  lost: ["synth-merch"],
};

export const run2Fixture: BacktestRun = {
  ...run1Fixture, runAt: "2026-10-17T10:00:00.000Z", method: "v2", methodNote: "Run 2 ranks the city's popular artists by taste fit.",
  n: 2, cases: [cases[0]!, cases[2]!],
  summary: {
    qloo_playbook: { scored: 2, hit10: 2, hit20: 2 },
    city_popularity: { scored: 2, hit10: 0, hit20: 1 },
    llm_only: { scored: 2, hit10: 0, hit20: 0 },
  },
  lost: [],
};

export const twoRunsFixture = { runs: [run1Fixture, run2Fixture] };
export const oneRunFixture = { runs: [run1Fixture] };
