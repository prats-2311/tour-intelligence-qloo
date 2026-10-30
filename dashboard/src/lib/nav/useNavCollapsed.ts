import { useCallback, useEffect, useState } from "react";

export const NAV_COLLAPSED_KEY = "tiq.nav.collapsed";

/** Below this width the board's two columns need the room, so with no stored choice the rail starts collapsed. */
const WIDE = "(min-width: 1440px)";
const read = (): boolean => {
  try {
    const v = localStorage.getItem(NAV_COLLAPSED_KEY);
    if (v !== null) return v === "1";
  } catch { /* fall through to the width default */ }
  try { return !window.matchMedia(WIDE).matches; } catch { return false; }
};
const write = (v: boolean): void => { try { localStorage.setItem(NAV_COLLAPSED_KEY, v ? "1" : "0"); } catch { /* private mode: state lives for the session only */ } };
const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Collapsed (64 px icons) vs expanded (240 px labels) desktop sidebar, remembered per browser; `[` toggles while the sidebar is on screen. */
export function useNavCollapsed(shortcutActive: boolean): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = useCallback(() => setCollapsed((c) => { write(!c); return !c; }), []);
  useEffect(() => {
    if (!shortcutActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcutActive, toggle]);
  return { collapsed, toggle };
}
