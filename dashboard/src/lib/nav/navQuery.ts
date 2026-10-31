import { useLocation } from "react-router-dom";
import { journeyQuery } from "@/lib/qloo/journey";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { isRoutingBrief } from "@/lib/qloo/showcase";

const MODE_KEYS = ["showcase", "sample"] as const;

/** Builds a nav link that keeps the data mode, the team workspace and the open saved tour: `showcase` / `sample` from the current URL (else from the run's own
 *  query, for a bare /tours/board that loaded the showcase) and `ws`. Page-local params (mode, new, …) are dropped. Params already on `to` win. */
export function navHref(to: string, urlSearch: string, runQuery: string): string {
  const [path = "", own = ""] = to.split("?");
  const out = new URLSearchParams(own);
  const url = new URLSearchParams(urlSearch);
  const run = new URLSearchParams(runQuery);
  const urlHasMode = MODE_KEYS.some((k) => url.has(k));
  if (!MODE_KEYS.some((k) => out.has(k))) {
    const src = urlHasMode ? url : run;
    for (const k of MODE_KEYS) if (src.has(k)) out.set(k, src.get(k)!);
  }
  const ws = url.get("ws");
  if (ws && !out.has("ws")) out.set("ws", ws);
  // A saved tour stays open across a reload: carry its id on links that are not showcase/sample ones.
  const saved = url.get("saved");
  if (saved && !out.has("saved") && !MODE_KEYS.some((k) => out.has(k))) out.set("saved", saved);
  const q = out.toString();
  return q ? `${path}?${q}` : path;
}

/** `navHref` bound to the current URL and board run: use for every nav link (sidebar, drawer, breadcrumbs). */
export function useNavHref(): (to: string) => string {
  const { search } = useLocation();
  const { state } = useTourBoard();
  const runQuery = journeyQuery(state.source, state.sampleSet, isRoutingBrief(state.brief));
  return (to) => navHref(to, search, runQuery);
}
