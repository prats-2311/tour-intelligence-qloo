import type { Verdict } from "@/lib/qloo/types";
import { VERDICT_LABEL } from "./VerdictChip";

const NS = "http://www.w3.org/2000/svg";
const RING = "#1c1b18";
const HIT = 44; // WCAG-comfortable hit area, independent of the visual size
const PAD = 4; // room for the 2px canvas ring on every side

type Shape = "circle" | "diamond" | "triangle" | "ring" | "x" | "square";
// DESIGN.md section 2.5: shape, size and mark hex per verdict.
const SPEC: Record<Verdict, { shape: Shape; size: number; color: string; opacity: number }> = {
  play: { shape: "circle", size: 10, color: "#0f9d8a", opacity: 1 },
  hidden_goldmine: { shape: "diamond", size: 12, color: "#ffcc00", opacity: 1 },
  de_risk: { shape: "triangle", size: 11, color: "#e8606f", opacity: 1 },
  consider: { shape: "ring", size: 10, color: "#5a86e8", opacity: 1 },
  skip: { shape: "x", size: 8, color: "#8b877c", opacity: 1 },
  insufficient_data: { shape: "square", size: 8, color: "#a4a094", opacity: 0.5 },
};

function svgEl(name: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function glyph(verdict: Verdict): SVGElement {
  const { shape, size, color, opacity } = SPEC[verdict];
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
}

/** A focusable 44px button wrapping a small verdict-shaped glyph. Shape, not colour, carries the verdict. */
export function markerElement({ verdict, city, label, selected, onSelect, reduce = false }: MarkerOptions): HTMLButtonElement {
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
  inner.append(glyph(verdict));
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

  el.addEventListener("click", onSelect);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  });
  return el;
}

/** Update selection visuals in place so the node (and keyboard focus) survives. */
export function setMarkerSelected(el: HTMLElement, selected: boolean): void {
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
export function markerSignature(c: { id: string; name: string; verdict: Verdict; label: string | null }): string {
  return [c.id, c.verdict, c.name, c.label ?? ""].join("|");
}
