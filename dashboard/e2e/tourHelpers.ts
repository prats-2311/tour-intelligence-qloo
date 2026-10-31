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
 * True when the tour ring sits on the on-screen target (the target's box padded by 6px, or that box cut to the viewport and the band the popover leaves free), measured in one frame so scrolling cannot skew it.
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
    if (Math.abs(r.left - (t.left - 6)) < 10 && Math.abs(r.top - (t.top - 6)) < 10 && Math.abs(r.width - (t.width + 12)) < 10 && Math.abs(r.height - (t.height + 12)) < 10) return true;
    // A target taller (or wider) than the free band gets a ring cut to the viewport and the band: it must lie inside the padded target and start where the visible part starts.
    const inside = r.left >= t.left - 16 && r.right <= t.right + 16 && r.top >= t.top - 16 && r.bottom <= t.bottom + 16;
    const cut = r.height < t.height + 12 - 10 || r.width < t.width + 12 - 10 || r.top >= t.top - 6 + 10; // a target flush with the viewport edge (the phone menu button) gets a ring clamped 4px in, exactly 10px off
    return inside && cut && r.height > 20;
  });
}, ids);

/**
 * How much of the first on-screen target for `ids` the user can actually see, and how much of it the tour popover covers.
 * `visible` is the share of the target inside the band the popover leaves free (the sticky header, the phone bottom bar and the popover itself are
 * outside it), measured against the most the band could ever show of that target, so a target taller than the band is judged on what fits.
 * `covered` is the popover's overlap as a share of the whole target.
 */
export const targetFit = (page: Page, ids: string[], phone: boolean) => page.evaluate(({ list, phone }) => {
  const all = [...document.querySelectorAll<HTMLElement>("[data-tour]")];
  let els: HTMLElement[] = [];
  for (const id of list) {
    els = all.filter((e) => (id.endsWith("*") ? (e.dataset.tour ?? "").startsWith(id.slice(0, -1)) : e.dataset.tour === id) && e.getClientRects().length > 0);
    if (els.length > 0) break;
  }
  const pop = document.querySelector<HTMLElement>("[data-testid='tour-popover']");
  if (els.length === 0 || !pop) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const pr = pop.getBoundingClientRect();
  // A target inside the sticky header (the Ask toggle) is judged against the whole screen; everything else against the band below the header.
  const inHeader = els[0]!.closest("header") !== null;
  let top = phone || inHeader ? 0 : 56, bottom = phone ? vh - 64 : vh;
  if (phone) { if (pr.top > vh / 2) bottom = pr.top; else top = pr.bottom; }
  const area = (l: number, t: number, r: number, b: number) => Math.max(0, r - l) * Math.max(0, b - t);
  const scored = els.map((el) => {
    const r = el.getBoundingClientRect();
    const full = r.width * r.height;
    const w = Math.min(r.right, vw) - Math.max(r.left, 0);
    const cap = Math.min(full, Math.max(0, w) * (bottom - top));
    const vis = area(Math.max(r.left, 0), Math.max(r.top, top), Math.min(r.right, vw), Math.min(r.bottom, bottom));
    const cov = area(Math.max(r.left, pr.left), Math.max(r.top, pr.top), Math.min(r.right, pr.right), Math.min(r.bottom, pr.bottom));
    // A target taller than the free band necessarily runs on under the popover; it is judged on its start (`visible`), not on `covered`.
    const fits = r.height <= bottom - top;
    return { visible: cap === 0 ? 0 : Math.min(1, vis / cap), covered: full === 0 || !fits ? 0 : cov / full };
  });
  return scored.sort((a, b) => b.visible - a.visible)[0]!;
}, { list: ids, phone });
