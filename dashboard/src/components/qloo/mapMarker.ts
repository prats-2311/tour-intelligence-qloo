import type { Verdict } from "@/lib/qloo/types";
import { VERDICT_LABEL, VERDICT_SHAPE } from "@/lib/qloo/labels";

const NS = "http://www.w3.org/2000/svg";
const RING = "#1c1b18";
const HIT = 44; // WCAG-comfortable hit area, independent of the visual size
const PAD = 4; // room for the 2px canvas ring on every side

// DESIGN.md section 2.5: size and mark hex per verdict; the shape comes from the shared VERDICT_SHAPE.
const SPEC: Record<Verdict, { size: number; color: string; opacity: number }> = {
  play: { size: 10, color: "#0f9d8a", opacity: 1 },
  hidden_goldmine: { size: 12, color: "#ffcc00", opacity: 1 },
  de_risk: { size: 11, color: "#e8606f", opacity: 1 },
  consider: { size: 10, color: "#5a86e8", opacity: 1 },
  skip: { size: 8, color: "#8b877c", opacity: 1 },
  insufficient_data: { size: 8, color: "#a4a094", opacity: 0.5 },
};

/**
 * Marker size = fan heat. The verdict's base size (SPEC above) is multiplied by a factor that runs linearly from `low` at fan heat 0
 * to `high` at fan heat 100, then rounded and bounded to [minSize, maxSize] px (the glyph only; the hit area stays 44px).
 * Missing or non-finite fan heat keeps the base size. The shape and colour still carry the verdict, never the size.
 */
export const MARKER_SCALE = { low: 0.8, high: 1.5, minSize: 6, maxSize: 18 } as const;

export function markerSize(verdict: Verdict, fanHeat: number | null | undefined): number {
  const base = SPEC[verdict].size;
  if (fanHeat === null || fanHeat === undefined || !Number.isFinite(fanHeat)) return base;
  const t = Math.min(100, Math.max(0, fanHeat)) / 100;
  const size = Math.round(base * (MARKER_SCALE.low + (MARKER_SCALE.high - MARKER_SCALE.low) * t));
  return Math.min(MARKER_SCALE.maxSize, Math.max(MARKER_SCALE.minSize, size));
}

/** What the marker tooltip shows. Scores are 0-100 (null: not enough data); `status` is a team status label when a workspace has one. */
export interface MarkerDetails { fanHeat: number | null; activation: number | null; winnability: number | null; status?: string | null }

const scoreText = (label: string, v: number | null): string => (v === null || !Number.isFinite(v) ? `${label} not enough data` : `${label} ${Math.round(v)}`);

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function glyph(verdict: Verdict, neutral = false, sizeOverride?: number): SVGElement {
  const { size: baseSize, color, opacity } = SPEC[neutral ? "insufficient_data" : verdict];
  const size = sizeOverride ?? baseSize;
  const shape = neutral ? "circle" : VERDICT_SHAPE[verdict];
  const box = size + PAD * 2, c = box / 2, h = size / 2;
  const svg = svgEl("svg", { width: box, height: box, viewBox: `0 0 ${box} ${box}`, "aria-hidden": "true", "data-shape": shape });
  svg.style.overflow = "visible";
  const g = svgEl("g", { opacity });
  // Filled shapes get the canvas ring as a 4px stroke painted behind the fill (2px visible).
  const filled = { fill: color, stroke: RING, "stroke-width": 4, "paint-order": "stroke", "stroke-linejoin": "round" };
  if (shape === "circle") g.append(svgEl("circle", { cx: c, cy: c, r: h, ...filled }));
  else if (shape === "diamond") g.append(svgEl("polygon", { points: `${c},${c - h} ${c + h},${c} ${c},${c + h} ${c - h},${c}`, ...filled }));
  else if (shape === "triangle") g.append(svgEl("polygon", { points: `${c},${c - h} ${c + h},${c + h} ${c - h},${c + h}`, ...filled }));
  else if (shape === "ring") {
    g.append(svgEl("circle", { cx: c, cy: c, r: h - 1, fill: "none", stroke: RING, "stroke-width": 4 }));
    g.append(svgEl("circle", { cx: c, cy: c, r: h - 1, fill: "none", stroke: color, "stroke-width": 2 }));
  } else if (shape === "x") {
    const d = `M${c - h},${c - h}L${c + h},${c + h}M${c + h},${c - h}L${c - h},${c + h}`;
    g.append(svgEl("path", { d, fill: "none", stroke: RING, "stroke-width": 4.5, "stroke-linecap": "round" }));
    g.append(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linecap": "round" }));
  } else {
    g.append(svgEl("rect", { x: c - h + 1, y: c - h + 1, width: size - 2, height: size - 2, fill: "none", stroke: RING, "stroke-width": 4 }));
    g.append(svgEl("rect", { x: c - h + 1, y: c - h + 1, width: size - 2, height: size - 2, fill: "none", stroke: color, "stroke-width": 2 }));
  }
  svg.append(g);
  return svg;
}

export interface MarkerOptions {
  verdict: Verdict;
  city: string;
  label: string | null;
  selected: boolean;
  onSelect: () => void;
  reduce?: boolean;
  /** One neutral circle, no verdict shape, label or interaction (the "Without Qloo" view). */
  neutral?: boolean;
  /** Scores and team status for the size scaling and the hover/focus tooltip. Absent: base size, no tooltip. */
  details?: MarkerDetails;
}

/** A focusable 44px button wrapping a small verdict-shaped glyph. Shape, not colour, carries the verdict. */
export function markerElement({ verdict, city, label, selected, onSelect, reduce = false, neutral = false, details }: MarkerOptions): HTMLButtonElement {
  if (neutral) return neutralMarker(city);
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `${city}, ${VERDICT_LABEL[verdict]}`);
  el.setAttribute("aria-pressed", String(selected));
  el.dataset.verdict = verdict;
  Object.assign(el.style, {
    width: `${HIT}px`, height: `${HIT}px`, padding: "0", border: "0", background: "transparent",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  });

  const inner = document.createElement("span");
  inner.dataset.inner = "true";
  Object.assign(inner.style, {
    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
    transition: reduce ? "none" : "transform 120ms ease-out",
  });
  const size = markerSize(verdict, details?.fanHeat);
  el.dataset.size = String(size);
  inner.append(glyph(verdict, false, size));
  el.append(inner);
  setMarkerSelected(el, selected);

  if (label) {
    const text = document.createElement("span");
    text.textContent = label;
    Object.assign(text.style, {
      position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: "-8px",
      fontFamily: '"Fraunces", ui-serif, Georgia, serif', fontSize: "13px", fontWeight: "600",
      color: "#e9e4d6", whiteSpace: "nowrap", pointerEvents: "none", paintOrder: "stroke fill", webkitTextStroke: "3px #151410", // halo for legibility on tiles, not a shadow
    });
    el.append(text);
  }

  if (details) attachTooltip(el, city, verdict, details);
  el.addEventListener("click", onSelect);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  });
  return el;
}

let tipSeq = 0;

/** A hover/focus tooltip (role="tooltip", described-by the button). Escape closes it; it never takes focus. */
function attachTooltip(el: HTMLButtonElement, city: string, verdict: Verdict, d: MarkerDetails): void {
  const tip = document.createElement("span");
  tip.id = `marker-tip-${++tipSeq}`;
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  Object.assign(tip.style, {
    position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", zIndex: "5", pointerEvents: "none",
    display: "none", flexDirection: "column", gap: "2px", minWidth: "150px", padding: "8px 10px", borderRadius: "8px",
    background: "#2a2924", color: "#e9e4d6", fontSize: "12px", lineHeight: "1.35", textAlign: "left", whiteSpace: "nowrap",
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', boxShadow: "0 0 0 1px #3a382f",
  });
  const head = document.createElement("strong");
  head.textContent = city;
  head.style.fontSize = "13px";
  const line = (text: string) => { const s = document.createElement("span"); s.textContent = text; return s; };
  tip.append(head, line(VERDICT_LABEL[verdict]), line(scoreText("Fan heat", d.fanHeat)), line(scoreText("Activation", d.activation)), line(scoreText("Winnability", d.winnability)));
  if (d.status) {
    const chip = document.createElement("span");
    chip.dataset.statusChip = "true";
    chip.textContent = d.status;
    Object.assign(chip.style, { alignSelf: "flex-start", marginTop: "2px", padding: "1px 8px", borderRadius: "999px", background: "#3a3932", fontSize: "11px", fontWeight: "600" });
    tip.append(chip);
  }
  const show = (on: boolean) => { tip.hidden = !on; tip.style.display = on ? "flex" : "none"; };
  el.append(tip);
  el.setAttribute("aria-describedby", tip.id);
  el.addEventListener("mouseenter", () => show(true));
  el.addEventListener("mouseleave", () => show(false));
  el.addEventListener("focus", () => show(true));
  el.addEventListener("blur", () => show(false));
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") show(false); });
}

function neutralMarker(city: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.disabled = true;
  el.tabIndex = -1;
  el.dataset.neutral = "true";
  el.setAttribute("aria-label", city);
  Object.assign(el.style, {
    width: `${HIT}px`, height: `${HIT}px`, padding: "0", border: "0", background: "transparent",
    pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center",
  });
  el.append(glyph("insufficient_data", true));
  return el;
}

/** Update selection visuals in place so the node (and keyboard focus) survives. */
export function setMarkerSelected(el: HTMLElement, selected: boolean): void {
  if (el.dataset.neutral) return;
  el.setAttribute("aria-pressed", String(selected));
  el.style.zIndex = selected ? "2" : "1";
  const inner = el.querySelector<HTMLElement>("[data-inner]");
  if (!inner) return;
  inner.style.transform = selected ? "scale(1.25)" : "none";
  const halo = inner.querySelector("[data-halo]");
  if (!selected) {
    halo?.remove();
    return;
  }
  if (halo) return;
  const h = document.createElement("span");
  h.dataset.halo = "true";
  const verdict = el.dataset.verdict as Verdict;
  Object.assign(h.style, {
    position: "absolute", width: "26px", height: "26px", borderRadius: "50%",
    border: `2px solid ${SPEC[verdict].color}4d`, // 30% of the verdict mark colour
  });
  inner.prepend(h);
}

/** Identity of everything a marker renders; a change means the marker must be rebuilt. */
export function markerSignature(c: { id: string; name: string; verdict: Verdict; label: string | null; details?: MarkerDetails }, neutral = false): string {
  const d = c.details;
  return neutral ? [c.id, "neutral", c.name].join("|") : [c.id, c.verdict, c.name, c.label ?? "", d ? [d.fanHeat, d.activation, d.winnability, d.status ?? ""].join(",") : ""].join("|");
}
