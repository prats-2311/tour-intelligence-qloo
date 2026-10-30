export type Crumb = { label: string; /** Plain path; callers add the preserved query. Absent for text-only crumbs and the current page. */ href?: string; current?: boolean };

const TOUR_PAGES: Record<string, string> = { "/tours/book": "Tour Book", "/tours/insights": "Charts", "/insights": "Charts", "/tours/budget": "Budget" };
const STANDALONE: Record<string, string> = { "/proof": "How we tested it", "/agents": "Use from your AI agent", "/v2": "What's next" };

/** The trail under the header. The tour segment is the artist; the city comes from the playbook route. Empty on the landing page. */
export function buildCrumbs({ pathname, artist, cityName }: { pathname: string; artist: string | null; cityName: string | null }): Crumb[] {
  if (pathname === "/") return [];
  const tour = { label: artist ? `${artist} tour` : "Your tour", href: "/tours/board" };
  const home = { label: "Overview", href: "/" };
  let trail: Crumb[];
  if (pathname === "/tours/board") trail = [home, tour, { label: "Tour Board" }];
  else if (pathname.startsWith("/tours/playbook/")) trail = [home, tour, { label: "Tour Board", href: "/tours/board" }, { label: cityName ?? "City" }, { label: "Playbook" }];
  else if (TOUR_PAGES[pathname]) trail = [home, tour, { label: TOUR_PAGES[pathname]! }];
  else if (STANDALONE[pathname]) trail = [home, { label: STANDALONE[pathname]! }];
  else trail = [home, { label: "Page not found" }];
  const last = trail.length - 1;
  return trail.map((c, i) => (i === last ? { label: c.label, current: true } : c));
}
