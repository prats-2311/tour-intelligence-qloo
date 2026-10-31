import { matchPath } from "react-router-dom";
import { BookOpen, Bot, ClipboardList, FlaskConical, FolderOpen, Home, LayoutList, Lightbulb, Link2, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";
import { REGISTERED_ROUTE_PATHS } from "@/lib/routeImports";

export type NavActionId = "activity" | "share";
export type NavId = "overview" | "board" | "mine" | "playbooks" | "book" | "insights" | "budget" | "team-activity" | "share" | "proof" | "agents" | "v2";

type Base = { id: NavId; label: string; icon: LucideIcon };
export type NavRouteItem = Base & {
  kind: "route";
  /** Static destination; null for Playbooks, whose target is the current city (see `resolveHref` in useNavLinks). */
  path: string | null;
  match: (pathname: string) => boolean;
  /** Shown instead of a link when the item has nowhere to go yet. */
  hint?: string;
};
export type NavActionItem = Base & { kind: "action"; action: NavActionId; needsWorkspace: true };
export type NavItem = NavRouteItem | NavActionItem;
export type NavGroup = { id: string; label: string; items: NavItem[] };

const exact = (p: string) => (pathname: string) => pathname === p;
const route = (id: NavId, label: string, icon: LucideIcon, path: string | null, match: (p: string) => boolean, hint?: string): NavRouteItem => ({ kind: "route", id, label, icon, path, match, hint });

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "plan", label: "Plan", items: [
      route("overview", "Overview", Home, "/", exact("/")),
      route("board", "Tour Board", LayoutList, "/tours/board", exact("/tours/board")),
      route("mine", "My tours", FolderOpen, "/tours/mine", exact("/tours/mine")),
      route("playbooks", "Playbooks", ClipboardList, null, (p) => p.startsWith("/tours/playbook/"), "Open a city on the Tour Board first"),
      route("book", "Tour Book", BookOpen, "/tours/book", exact("/tours/book")),
      route("insights", "Charts", Lightbulb, "/tours/insights", (p) => p === "/tours/insights" || p === "/insights"),
      route("budget", "Budget", Wallet, "/tours/budget", exact("/tours/budget")),
    ],
  },
  {
    id: "team", label: "Team", items: [
      { kind: "action", id: "team-activity", label: "Team activity", icon: Users, action: "activity", needsWorkspace: true },
      { kind: "action", id: "share", label: "Share link", icon: Link2, action: "share", needsWorkspace: true },
    ],
  },
  {
    id: "more", label: "More", items: [
      route("proof", "How we tested it", FlaskConical, "/proof", exact("/proof")),
      route("agents", "Use from your AI agent", Bot, "/agents", exact("/agents")),
      route("v2", "What's next", Sparkles, "/v2", exact("/v2")),
    ],
  },
];

/** True when `path` matches a registered route pattern (":param" segments allowed). */
export const isRouteAvailable = (path: string, routes: readonly string[] = REGISTERED_ROUTE_PATHS): boolean =>
  routes.some((pattern) => matchPath({ path: pattern, end: true }, path) !== null);

export function visibleNavGroups({ routes = REGISTERED_ROUTE_PATHS, hasWorkspace }: { routes?: readonly string[]; hasWorkspace: boolean }): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => (i.kind === "action" ? hasWorkspace : i.path === null || isRouteAvailable(i.path, routes))),
    }))
    .filter((g) => g.items.length > 0);
}
