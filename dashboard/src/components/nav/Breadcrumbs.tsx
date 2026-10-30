import { useState } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { buildCrumbs } from "@/lib/nav/breadcrumbs";
import { useNavHref } from "@/lib/nav/navQuery";
import { resolveTourNames } from "@/lib/nav/tourNames";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { useMediaQuery } from "@/lib/useMediaQuery";

const link = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] px-1 text-canvas-muted outline-none hover:text-bone focus-visible:ring-2 focus-visible:ring-gold lg:min-h-8 lg:min-w-0";

/** The trail under the header, on every page except the landing page. */
export function Breadcrumbs({ inline = false }: { /** In the phone top bar next to the hamburger: no padding or own row. */ inline?: boolean }) {
  const { pathname, search } = useLocation();
  const { state } = useTourBoard();
  const href = useNavHref();
  const narrow = useMediaQuery("(max-width: 639px)");
  const [expanded, setExpanded] = useState(false);
  const cityId = matchPath("/tours/playbook/:cityId", pathname)?.params.cityId ?? null;
  const { artist, cityName } = resolveTourNames({ stateArtist: state.brief?.artist ?? state.artist?.name, stateCities: state.cities, search, cityId });
  const crumbs = buildCrumbs({ pathname, artist, cityName });
  if (crumbs.length === 0) return null;
  const collapsed = narrow && !expanded && crumbs.length > 3;
  const shown = collapsed ? [crumbs[0]!, null, crumbs[crumbs.length - 1]!] : crumbs;
  return (
    <nav aria-label="Breadcrumb" data-breadcrumbs className={inline ? "flex min-w-0 flex-1 items-center" : "flex min-h-9 items-center px-4 lg:px-8"}>
      <ol className={`m-0 flex min-w-0 list-none items-center gap-x-1 p-0 font-sans text-[13px] ${inline ? "flex-nowrap overflow-hidden" : "flex-wrap"}`}>
        {shown.map((c, i) => (
          <li key={c ? `${i}-${c.label}` : "more"} className={`flex min-w-0 items-center ${i > 0 ? "gap-1 before:mr-0.5 before:text-canvas-muted before:content-['›']" : ""}`}>
            {c === null ? (
              <button type="button" aria-label="Show full path" onClick={() => setExpanded(true)} className={link}>…</button>
            ) : c.current ? (
              <span aria-current="page" className="truncate font-medium text-bone">{c.label}</span>
            ) : c.href ? (
              <Link to={href(c.href)} className={`${link} truncate`}>{c.label}</Link>
            ) : (
              <span className="truncate text-canvas-muted">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
