export type Crumb = { label: string; /** Plain path; callers add the preserved query. Absent for text-only crumbs and the current page. */ href?: string; current?: boolean };

const TOUR_PAGES: Record<string, string> = { "/tours/book": "Tour Book", "/tours/insights": "Charts", "/insights": "Charts", "/tours/budget": "Budget" };
const STANDALONE: Record<string, string> = { "/proof": "How we tested it", "/agents": "Use from your AI agent", "/v2": "What's next", "/tours/mine": "My tours" };

const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** The trail under the header. The tour segment is the artist; the city comes from the playbook route. Empty on the landing page. */
export function buildCrumbs({ pathname, artist, cityName, fresh = false, example = false }: { pathname: string; artist: string | null; cityName: string | null; /** The blank "Plan a tour" form (?new=1): no tour exists yet, so no artist. */ fresh?: boolean; /** A recorded or sample run: the tour crumb says "Example: <artist> tour". */ example?: boolean }): Crumb[] {
  const pitch = /^\/tours\/pitch\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (pathname === "/") return [];
  if (fresh && pathname === "/tours/board") return [{ label: "Overview", href: "/" }, { label: "New tour", current: true }];
  const tour = { label: artist ? `${example ? "Example: " : ""}${artist} tour` : "Your tour", href: "/tours/board" };
  const home = { label: "Overview", href: "/" };
  let trail: Crumb[];
  if (pathname === "/tours/board") trail = [home, tour, { label: "Tour Board" }];
  else if (pathname.startsWith("/tours/playbook/")) trail = [home, tour, { label: "Tour Board", href: "/tours/board" }, { label: cityName ?? "City" }, { label: "Playbook" }];
  else if (pitch) trail = [home, tour, { label: "Tour Board", href: "/tours/board" }, { label: cityName ?? "City", href: `/tours/playbook/${pitch[1]}` }, { label: `Pitch sheet · ${safeDecode(pitch[2]!)}` }];
  else if (TOUR_PAGES[pathname]) trail = [home, tour, { label: TOUR_PAGES[pathname]! }];
  else if (STANDALONE[pathname]) trail = [home, { label: STANDALONE[pathname]! }];
  else trail = [home, { label: "Page not found" }];
  const last = trail.length - 1;
  return trail.map((c, i) => (i === last ? { label: c.label, current: true } : c));
}
