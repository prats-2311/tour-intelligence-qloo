import type { WebResult } from "../types.js";

export type WebSearch = (query: string) => Promise<WebResult[]>;

/** Basic-depth search only (1 credit), at most 5 results. Never research/crawl/extract (spec §9.2b). */
export function createTavilySearch(opts: { apiKey: string; fetchImpl?: typeof fetch }): WebSearch {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async (query) => {
    const res = await fetchImpl("https://api.tavily.com/search", {
      method: "POST",
      headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const json = (await res.json()) as { results?: Array<{ url?: unknown; title?: unknown; content?: unknown }> };
    return (json.results ?? []).slice(0, 5).flatMap((r, i) =>
      typeof r.url === "string" && typeof r.title === "string"
        ? [{ id: `w${i + 1}`, url: r.url, title: r.title, content: typeof r.content === "string" ? r.content.slice(0, 1500) : "" }] : []);
  };
}
