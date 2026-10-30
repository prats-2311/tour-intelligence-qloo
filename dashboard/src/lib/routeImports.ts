// One import() per lazy route. App.tsx wraps these in React.lazy and routePreload calls the same functions,
// so a preload and the later navigation share a single module request.
export const routeImports = {
  landing: () => import("../pages/Landing"),
  board: () => import("../pages/TourBoard"),
  playbook: () => import("../pages/CityPlaybook"),
  pitch: () => import("../pages/PitchSheet"),
  book: () => import("../pages/TourBook"),
  budget: () => import("../pages/TourBudget"),
  proof: () => import("../pages/Proof"),
  insights: () => import("../pages/TasteInsights"),
  tourInsights: () => import("../pages/TourInsights"),
  v2: () => import("../pages/V2Preview"),
  agents: () => import("../pages/Agents"),
};
export type RouteKey = keyof typeof routeImports;

/** Every path App.tsx registers a page for (not the legacy redirects or the catch-all). The nav hides an item whose route is not listed,
 *  so a branch that adds a route adds its path here and the item appears. App.shell.test.tsx checks this list against App.tsx. */
export const REGISTERED_ROUTE_PATHS: readonly string[] = ["/", "/tours/board", "/tours/playbook/:cityId", "/tours/book", "/proof", "/insights", "/v2", "/agents"];
