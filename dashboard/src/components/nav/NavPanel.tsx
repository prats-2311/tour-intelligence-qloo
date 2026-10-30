import { useLocation } from "react-router-dom";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { visibleNavGroups, type NavActionId } from "@/lib/nav/navConfig";
import { useNavHref } from "@/lib/nav/navQuery";
import { journeyLinks } from "@/lib/qloo/journey";
import { isRoutingBrief } from "@/lib/qloo/showcase";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { NavList } from "./NavList";

/** The nav list wired to the router, the board run (for the Playbooks target) and the team workspace. */
export function NavPanel({ collapsed, onAction, onNavigate }: { collapsed: boolean; onAction: (a: NavActionId) => void; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const w = useWorkspace();
  const hrefFor = useNavHref();
  const { state, shortlist, lastOpenedId } = useTourBoard();
  const links = journeyLinks({ status: state.status, source: state.source, sampleSet: state.sampleSet, routing: isRoutingBrief(state.brief), cities: state.cities, shortlist, lastOpenedId });
  const playbookHref = links.playbook.startsWith("/tours/playbook/") ? links.playbook : null;
  const groups = visibleNavGroups({ hasWorkspace: w.enabled });
  return <NavList groups={groups} pathname={pathname} hrefFor={hrefFor} playbookHref={playbookHref} collapsed={collapsed} onAction={onAction} onNavigate={onNavigate} />;
}
