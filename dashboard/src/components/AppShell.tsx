import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Compass, Route, ChartColumn, ChevronsUpDown, Plus, Check, HelpCircle, ArrowLeftRight, Globe2 } from "lucide-react";
import { useCampaignContext } from "../lib/campaignContext";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { StrategistDock, StrategistFab, StrategistToggle, showsStrategist, useStrategistDock } from "./strategist/StrategistLauncher";
import { TourGuide, hasSeenTour } from "./ui/TourGuide";

const NAV_ITEMS = [
  { to: "/", label: "Discover", icon: Compass, end: true },
  { to: "/tours/board", label: "Tours", icon: Route, end: false },
  { to: "/insights", label: "Insights", icon: ChartColumn, end: false },
];

const toolLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-sans text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold ${
    isActive ? "text-bone" : "text-canvas-muted hover:text-bone"
  }`;

const CAMPAIGN_PREFIXES = ["/campaign", "/city", "/compare", "/cities"];

function typeLabel(campaignType: string) {
  return campaignType.replace(/_/g, " ");
}

function CampaignSwitcher() {
  const { campaigns, activeCampaignId, activeCampaign, setActiveCampaignId } = useCampaignContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={rootRef} data-tour="campaign-switcher" className="relative">
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-lg bg-paper-raised shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]">
          <div className="max-h-56 overflow-y-auto py-1">
            {campaigns.map((c) => (
              <button
                key={c.campaign_id}
                onClick={() => {
                  setActiveCampaignId(c.campaign_id);
                  setOpen(false);
                  navigate("/campaign");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left font-sans text-[12px] text-canvas-text hover:bg-canvas-line/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-[13px]">{c.title}</span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.08em] text-canvas-muted">
                    {typeLabel(c.campaign_type)}
                  </span>
                </span>
                {c.campaign_id === activeCampaignId && <Check size={13} className="shrink-0 text-gold" />}
              </button>
            ))}
          </div>
          <NavLink
            to="/campaigns/new"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 border-t border-canvas-line px-3 py-2.5 font-sans text-[12px] text-gold hover:bg-canvas-line/50"
          >
            <Plus size={13} /> New Campaign
          </NavLink>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-paper-raised px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0">
          <span className="block font-sans text-[10px] uppercase tracking-[0.1em] text-canvas-muted">
            Active Campaign
          </span>
          <span className="mt-1 block truncate font-display text-[14px] text-canvas-text">
            {activeCampaign?.title ?? "Loading…"}
          </span>
          {activeCampaign && (
            <span className="block truncate font-sans text-[11px] text-canvas-muted">
              {typeLabel(activeCampaign.campaign_type)} · {activeCampaign.genre}
            </span>
          )}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-canvas-muted" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [tourActive, setTourActive] = useState(false);
  const dock = useStrategistDock();
  const strategistRoute = showsStrategist(location.pathname);
  const docked = isDesktop && strategistRoute && dock.open;
  const inCampaign = CAMPAIGN_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));

  function replayTour() {
    if (location.pathname !== "/campaign") {
      navigate("/campaign");
      setTimeout(() => setTourActive(true), 300);
    } else {
      setTourActive(true);
    }
  }

  // Only auto-launch from the Dashboard route -- that's where every
  // step's target actually lives; deep-linking in mid-tour on another page
  // would just point at nothing.
  useEffect(() => {
    if (location.pathname === "/campaign" && !hasSeenTour()) {
      const t = setTimeout(() => setTourActive(true), 500);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  const campaignTools = inCampaign && (
    <div className="flex flex-wrap items-center gap-2">
      <NavLink to="/compare" data-tour="compare-cities-nav" className={toolLink}>
        <ArrowLeftRight size={15} aria-hidden /> Compare
      </NavLink>
      <NavLink to="/cities/add" className={toolLink}>
        <Globe2 size={15} aria-hidden /> Add cities
      </NavLink>
      <div className="w-56 max-w-full"><CampaignSwitcher /></div>
      <button
        onClick={replayTour}
        aria-label="Replay product tour"
        title="Replay product tour"
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-canvas-muted outline-none hover:text-gold focus-visible:ring-2 focus-visible:ring-gold"
      >
        <HelpCircle size={16} />
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TourGuide active={tourActive} onClose={() => setTourActive(false)} />

      {isDesktop ? (
        <header data-app-shell className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between bg-canvas-raised px-8">
          <div className="flex items-center gap-8">
            <div className="flex items-baseline gap-2">
              <span className="font-title text-[18px] font-semibold text-bone">Tour Intelligence</span>
              <span className="font-sans text-[13px] font-medium text-canvas-muted">× Qloo</span>
            </div>
            <nav aria-label="Primary" className="flex items-center gap-6">
              {NAV_ITEMS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative flex h-14 items-center font-sans text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold ${
                      isActive ? "text-bone" : "text-canvas-muted hover:text-bone"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {label}
                      {isActive && <span aria-hidden className="absolute inset-x-0 bottom-2 h-0.5 bg-gold" />}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {strategistRoute && <StrategistToggle open={dock.open} onToggle={() => dock.setOpen(!dock.open)} />}
            {campaignTools}
          </div>
        </header>
      ) : (
        <nav
          data-app-shell
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 bg-canvas-raised pb-[env(safe-area-inset-bottom)]"
        >
          <div className="flex h-16 items-stretch justify-around">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
                    isActive ? "text-bone" : "text-canvas-muted"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span aria-hidden className="absolute top-2 h-[3px] w-5 bg-gold" />}
                    <Icon size={22} aria-hidden className="mt-1" />
                    <span className="font-display text-[11px] uppercase tracking-[0.08em]">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}

      <main className={`min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8 ${isDesktop ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))]"} ${docked ? "lg:pr-[380px]" : ""}`}>
        {!isDesktop && campaignTools && <div className="mb-4">{campaignTools}</div>}
        {children}
      </main>

      {strategistRoute && !isDesktop && <StrategistFab />}
      {docked && <StrategistDock onClose={() => dock.setOpen(false)} />}
    </div>
  );
}
