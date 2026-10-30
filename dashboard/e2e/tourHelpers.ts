import type { Page } from "@playwright/test";

// Helpers for the guided-tour specs. `ids` are data-tour values tried in order, like the overlay does; a trailing * is a prefix.

/** The first of `ids` that is on screen (exact data-tour value, or prefix with a trailing *): its box and label. */
export const visibleTarget = (page: Page, ids: string[]) => page.evaluate((list) => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-tour]")];
  let el: HTMLElement | undefined;
  for (const id of list) {
    el = all.find((e) => (id.endsWith("*") ? (e.dataset.tour ?? "").startsWith(id.slice(0, -1)) : e.dataset.tour === id) && e.getClientRects().length > 0);
    if (el) break;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { tour: el.dataset.tour!, label: el.getAttribute("aria-label") ?? "", text: (el.textContent ?? "").trim().slice(0, 40), top: r.top, left: r.left, width: r.width, height: r.height };
}, ids);

/**
 * True when the tour ring sits on the on-screen target (the target's box padded by 6px), measured in one frame so scrolling cannot skew it.
 * A prefix id (trailing *) matches several elements (every board row is `city-<id>`) and the overlay picks one by exact id, which the spec cannot
 * know on an arbitrary recording: the ring must then sit on one of them.
 */
export const ringOnTarget = (page: Page, ids: string[]) => page.evaluate((list) => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-tour]")];
  let els: HTMLElement[] = [];
  for (const id of list) {
    els = all.filter((e) => (id.endsWith("*") ? (e.dataset.tour ?? "").startsWith(id.slice(0, -1)) : e.dataset.tour === id) && e.getClientRects().length > 0);
    if (els.length > 0) break;
  }
  const ring = document.querySelector<HTMLElement>("[data-testid='tour-ring']");
  if (els.length === 0 || !ring) return false;
  const r = ring.getBoundingClientRect();
  return els.some((el) => {
    const t = el.getBoundingClientRect();
    return Math.abs(r.left - (t.left - 6)) < 10 && Math.abs(r.top - (t.top - 6)) < 10 && Math.abs(r.width - (t.width + 12)) < 10 && Math.abs(r.height - (t.height + 12)) < 10;
  });
}, ids);
