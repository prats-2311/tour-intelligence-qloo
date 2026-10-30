import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { NavActionId, NavGroup, NavItem } from "@/lib/nav/navConfig";

type Props = {
  groups: NavGroup[];
  pathname: string;
  /** Adds the preserved ?showcase / ?sample / ?ws query to a path (every link goes through it). */
  hrefFor: (path: string) => string;
  /** Where Playbooks leads right now (current or last city), null when there is nothing to open yet. */
  playbookHref: string | null;
  collapsed: boolean;
  onAction: (a: NavActionId) => void;
  /** A link was followed (the drawer closes on it). */
  onNavigate?: () => void;
};

const row = (collapsed: boolean, active: boolean) =>
  `relative flex min-h-11 w-full items-center gap-3 rounded-[8px] text-left font-sans text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold ${collapsed ? "justify-center px-0" : "px-3"} ` +
  (active
    ? "bg-canvas-line text-bone before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-gold before:content-['']"
    : "text-canvas-muted hover:bg-canvas-line hover:text-bone");

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span data-tooltip aria-hidden className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-paper px-2.5 py-1.5 text-[12px] font-medium text-bone opacity-0 shadow-lg transition-opacity motion-reduce:transition-none group-focus-within/item:opacity-100 group-hover/item:opacity-100">
      {children}
    </span>
  );
}

function Row({ item, active, collapsed, href, onAction, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; href: string | null; onAction: Props["onAction"]; onNavigate?: () => void }) {
  const hintId = useId();
  const Icon = item.icon;
  const label = <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>;
  const icon = <Icon size={20} aria-hidden className={`shrink-0 ${active ? "text-gold" : ""}`} />;
  let body: ReactNode;
  let tip = item.label;
  if (item.kind === "action") {
    body = <button type="button" onClick={() => onAction(item.action)} className={row(collapsed, false)}>{icon}{label}</button>;
  } else if (href === null) {
    tip = `${item.label}: ${item.hint ?? ""}`;
    body = (
      <a role="link" aria-label={item.label} aria-disabled="true" aria-describedby={hintId} className={`${row(collapsed, false)} cursor-not-allowed opacity-60`}>
        {icon}
        <span className="flex min-w-0 flex-col">
          {label}
          <span id={hintId} className={collapsed ? "sr-only" : "text-[12px] font-normal leading-snug text-canvas-muted"}>{item.hint}</span>
        </span>
      </a>
    );
  } else {
    body = <Link to={href} aria-current={active ? "page" : undefined} onClick={onNavigate} className={row(collapsed, active)}>{icon}{label}</Link>;
  }
  return <li className="group/item relative">{body}{collapsed && <Tooltip>{tip}</Tooltip>}</li>;
}

/** The grouped nav links shared by the desktop rail and the mobile drawer. */
export function NavList({ groups, pathname, hrefFor, playbookHref, collapsed, onAction, onNavigate }: Props) {
  return (
    <nav aria-label="Sections" className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <section key={g.id} aria-labelledby={`nav-g-${g.id}`} className="flex flex-col gap-1">
          {collapsed && gi > 0 && <div aria-hidden className="mx-3 mb-1 h-px bg-canvas-line" />}
          <h2 id={`nav-g-${g.id}`} className={collapsed ? "sr-only" : "px-3 pb-1 font-display text-[11px] uppercase tracking-[0.08em] text-canvas-muted"}>{g.label}</h2>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {g.items.map((item) => {
              const isPlaybooks = item.id === "playbooks";
              const href = item.kind === "route" ? (isPlaybooks ? (playbookHref ? hrefFor(playbookHref) : null) : hrefFor(item.path!)) : null;
              const active = item.kind === "route" && item.match(pathname) && href !== null;
              return <Row key={item.id} item={item} active={active} collapsed={collapsed} href={item.kind === "route" ? href : null} onAction={onAction} onNavigate={onNavigate} />;
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
