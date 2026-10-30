/** True when the location is the step's page: same path, and every query parameter the step names has the same value (`ws` and other extras are ignored). */
export function routeMatches(route: string, pathname: string, search: string): boolean {
  const want = new URL(route, "http://tour.local");
  if (want.pathname !== pathname) return false;
  const have = new URLSearchParams(search);
  for (const [k, v] of want.searchParams) if (have.get(k) !== v) return false;
  return true;
}

/** The step's route with the current workspace id carried along, so a tour step never drops `ws`. */
export function routeKeepingWs(route: string, ws: string | null): string {
  if (!ws) return route;
  const u = new URL(route, "http://tour.local");
  if (!u.searchParams.has("ws")) u.searchParams.set("ws", ws);
  return `${u.pathname}${u.search}${u.hash}`;
}
