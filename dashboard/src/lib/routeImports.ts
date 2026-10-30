// One import() per lazy route. App.tsx wraps these in React.lazy and routePreload calls the same functions,
// so a preload and the later navigation share a single module request.
export const routeImports = {
  landing: () => import("../pages/Landing"),
  board: () => import("../pages/TourBoard"),
  playbook: () => import("../pages/CityPlaybook"),
  book: () => import("../pages/TourBook"),
  proof: () => import("../pages/Proof"),
  insights: () => import("../pages/TasteInsights"),
  tourInsights: () => import("../pages/TourInsights"),
  v2: () => import("../pages/V2Preview"),
  agents: () => import("../pages/Agents"),
};
export type RouteKey = keyof typeof routeImports;
