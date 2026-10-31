import { useCallback, useRef } from "react";
import { routeImports, type RouteKey } from "./routeImports";

/** The lazy route a path belongs to (query and hash ignored), or null for routes that are not code-split here. */
export function routeKey(path: string): RouteKey | null {
  const p = path.split(/[?#]/)[0] ?? "";
  if (p === "/") return "landing";
  if (p === "/tours/board") return "board";
  if (p === "/tours/mine") return "mine";
  if (p.startsWith("/tours/playbook/")) return "playbook";
  if (p === "/tours/book") return "book";
  if (p === "/tours/budget") return "budget";
  if (p === "/proof") return "proof";
  if (p === "/insights") return "insights";
  if (p === "/tours/insights") return "tourInsights";
  return null;
}

/** Loads a route's JS chunk only. It never fetches data: recordings are already in memory and no Qloo, Gemini or Tavily call is made. */
export function preloadRoute(path: string): void {
  const k = routeKey(path);
  if (k) void routeImports[k]().catch(() => { /* a failed preload is retried by the real navigation */ });
}

/** Callback ref for the primary "next step" control: preloads the next route's chunk once the control is on screen. */
export function usePreloadWhenVisible(path: string | null): (el: Element | null) => void {
  const io = useRef<IntersectionObserver | null>(null);
  return useCallback((el: Element | null) => {
    io.current?.disconnect();
    io.current = null;
    if (!el || !path) return;
    if (typeof IntersectionObserver === "undefined") { preloadRoute(path); return; }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { preloadRoute(path); obs.disconnect(); }
    });
    obs.observe(el);
    io.current = obs;
  }, [path]);
}
