const NS = "http://www.w3.org/2000/svg";
const C = document.getElementById("c");
const COL = { y: "#ffcc00", b: "#6aa8ff", m: "#a4a094", t: "#f2f0ea", g: "#8fd694" };
const svg = document.createElementNS(NS, "svg");
svg.setAttribute("class", "over");
svg.innerHTML = `<defs>${Object.entries(COL).map(([k, c]) => `<marker id="m${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join("")}</defs>`;
function px(n) { return n + "px"; }
function h(html, cls, x, y, w, hh) { const d = document.createElement("div"); d.className = cls; d.style.left = px(x); d.style.top = px(y); if (w) d.style.width = px(w); if (hh) d.style.height = px(hh); d.innerHTML = html; C.appendChild(d); return d; }
function title(t, s) { const a = document.createElement("h1"); a.textContent = t; C.appendChild(a); if (s) { const b = document.createElement("div"); b.className = "sub"; b.innerHTML = s; C.appendChild(b); } }
function zone(x, y, w, hh, label, cls = "") { h("", "zone " + cls, x, y, w, hh); if (label) h(label, "zlabel " + (cls.includes("grey") ? "grey" : ""), x + 16, y + 10); }
function box(x, y, w, hh, t, s, kind = "") { return h(`<div class="t">${t}</div>${s ? `<div class="s">${s}</div>` : ""}`, "box " + kind, x, y, w, hh); }
function lbl(x, y, html, cls = "", w) { return h(html, "lbl " + cls, x, y, w); }
function num(x, y, n, cls = "") { return h(String(n), "num " + cls, x, y); }
// arrow(points, {c: 'y'|'b'|'m'|'t', dash, both, w})
function arrow(pts, o = {}) {
  const c = o.c || "m";
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", "M" + pts.map((q) => q.join(",")).join(" L"));
  p.setAttribute("fill", "none"); p.setAttribute("stroke", COL[c]); p.setAttribute("stroke-width", o.w || 2);
  if (o.dash) p.setAttribute("stroke-dasharray", "7 6");
  p.setAttribute("marker-end", `url(#m${c})`);
  if (o.both) p.setAttribute("marker-start", `url(#m${c})`);
  svg.appendChild(p);
}
function legend(items) { h(items.map(([c, t, st]) => `<span><i style="border-color:${c};${st || ""}"></i>${t}</span>`).join(""), "legend", 40, 0).style.top = "auto"; }
document.addEventListener("DOMContentLoaded", () => {});
window.__svg = svg;
function finish() { C.appendChild(svg); }
