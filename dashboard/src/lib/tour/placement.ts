/** Pure placement maths for the guided tour: where to scroll so a target is fully in the free band, and how to keep its ring on screen. All values are viewport pixels. */
export interface Rect { top: number; left: number; width: number; height: number }

const TITLE_GAP = 8;
const NO_JITTER = 4;

/**
 * How far to scroll (positive = down) so `target` sits fully inside the free band [topLimit, bottomLimit] (the band between the sticky header and the
 * bottom sheet). When the page title and the target fit together it keeps the title in view; a small target is centred in the band; a taller one
 * shows its start under the header.
 */
export function scrollDelta({ target, title, topLimit, bottomLimit }: { target: { top: number; height: number }; title: { top: number } | null; topLimit: number; bottomLimit: number }): number {
  const avail = bottomLimit - topLimit;
  let wanted: number;
  if (title && title.top < target.top && target.top + target.height - title.top <= avail - TITLE_GAP) {
    const delta = title.top - (topLimit + TITLE_GAP);
    return Math.abs(delta) < NO_JITTER ? 0 : delta;
  }
  if (target.height <= avail) wanted = topLimit + (avail - target.height) / 2;
  else wanted = topLimit + TITLE_GAP;
  const delta = target.top - wanted;
  return Math.abs(delta) < NO_JITTER ? 0 : delta;
}

/** The ring box cut to the viewport (2 px margin) and the free band, so a tall or off-edge target never draws a ring that leaves the screen. */
export function clampRing(b: Rect, { vw, topLimit, bottomLimit }: { vw: number; topLimit: number; bottomLimit: number }): Rect {
  const left = Math.max(2, b.left);
  const right = Math.min(vw - 2, b.left + b.width);
  const top = Math.max(topLimit, b.top);
  const bottom = Math.min(bottomLimit, b.top + b.height);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** The top edge of whatever covers the bottom of the screen: the phone sheet, or the viewport bottom when nothing does. */
export const sheetTopOf = (sheetTop: number | null, vh: number): number => sheetTop ?? vh;

/** Where a popover goes when it cannot sit beside, below or above its target: the screen corner the target overlaps least (bottom right wins ties). */
export function bestCorner(b: Rect, { popW, popH, vw, vh, header, margin }: { popW: number; popH: number; vw: number; vh: number; header: number; margin: number }): { top: number; left: number } {
  const corners = [
    { top: vh - popH - margin, left: vw - popW - margin },
    { top: vh - popH - margin, left: margin },
    { top: header + margin, left: vw - popW - margin },
    { top: header + margin, left: margin },
  ].map((c) => ({ top: Math.max(header, c.top), left: Math.max(0, c.left) }));
  const overlap = (c: { top: number; left: number }) => Math.max(0, Math.min(b.left + b.width, c.left + popW) - Math.max(b.left, c.left)) * Math.max(0, Math.min(b.top + b.height, c.top + popH) - Math.max(b.top, c.top));
  return corners.reduce((best, c) => (overlap(c) < overlap(best) ? c : best));
}
