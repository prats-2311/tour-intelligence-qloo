import type { GroundRow } from "./grounding.js";
import { GROUND_CATEGORY_LABEL } from "./proofResults.js";
import { countryLabel } from "./proofShared.js";
import { sha256Hex } from "./proofStats.js";

/** Test C's blinded review sheet (docs/qloo/proof-v3-protocol.md, Amendment 4). The page must never say where a name came from. */
export type Rating = "in_city" | "other_city" | "not_exist" | "cant_tell";
export const RATING_CODES: readonly Rating[] = ["in_city", "other_city", "not_exist", "cant_tell"];
export const RATING_LABELS: readonly string[] = ["Exists, in this city", "Exists, in another city", "Doesn't exist", "Can't tell"];

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Identifies one sheet: the visible content only (id, city, country, category, name), in id order. */
export function sheetHash(rows: GroundRow[]): string {
  const view = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => [r.id, r.cityId, r.city, r.country, r.category, r.name]);
  return sha256Hex(JSON.stringify(view)).slice(0, 16);
}

const CSS = `
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--mute:#6a6a64;--line:#dcdad3;--accent:#1f5fbf;--done:#e8f3ea;--focus:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--card:#21211f;--ink:#efede8;--mute:#a3a29b;--line:#383835;--accent:#7aa7f0;--done:#1d2b20;--focus:#7aa7f0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}
h1{font-size:1.4rem;margin:8px 0}
#instructions{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px}
#instructions li{margin:4px 0}
.bar{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 0;display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);margin-bottom:12px}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
ol{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.row{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.row.done{background:var(--done)}
.row:focus{outline:3px solid var(--focus);outline-offset:1px}
.meta{display:flex;flex-wrap:wrap;gap:8px;color:var(--mute);font-size:.85rem}
.rid{font-variant-numeric:tabular-nums;font-weight:600}
.name{font-size:1.15rem;font-weight:600;margin:4px 0}
.links{display:flex;gap:16px;margin-bottom:8px}
.links a{color:var(--accent)}
fieldset{border:0;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}
label{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px 10px;cursor:pointer}
label:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
kbd{font:inherit;font-size:.8rem;border:1px solid var(--line);border-radius:4px;padding:0 5px;color:var(--mute)}
`;

const SCRIPT = (hash: string, ids: string[]): string => `
(function(){
  var KEY="grounding-sheet-${hash}", CODES=${JSON.stringify(RATING_CODES)}, IDS=${JSON.stringify(ids)};
  var answers={};
  try{answers=JSON.parse(window.localStorage.getItem(KEY)||"{}")||{};}catch(e){answers={};}
  function save(){try{window.localStorage.setItem(KEY,JSON.stringify(answers));}catch(e){}}
  function count(){var n=0;for(var i=0;i<IDS.length;i++){if(answers[IDS[i]])n++;}document.getElementById("done").textContent=String(n);}
  function paint(id){
    var row=document.getElementById(id);if(!row)return;
    var v=answers[id]||"";
    var radios=row.querySelectorAll("input[type=radio]");
    for(var i=0;i<radios.length;i++){radios[i].checked=(radios[i].value===v);}
    row.className=v?"row done":"row";
  }
  function pick(id,code){answers[id]=code;save();paint(id);count();}
  for(var i=0;i<IDS.length;i++){paint(IDS[i]);}
  count();
  document.addEventListener("change",function(e){
    var t=e.target;
    if(t&&t.type==="radio"&&t.checked){pick(t.name,t.value);}
  });
  var current=null;
  document.addEventListener("focusin",function(e){
    var t=e.target;
    var row=t&&t.closest?t.closest(".row"):null;
    if(row)current=row;
  });
  document.addEventListener("keydown",function(e){
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(!/^[1-4]$/.test(e.key))return;
    var row=current;
    if(!row){for(var i=0;i<IDS.length;i++){if(!answers[IDS[i]]){row=document.getElementById(IDS[i]);break;}}}
    if(!row)return;
    e.preventDefault();
    pick(row.id,CODES[Number(e.key)-1]);
    var next=row.nextElementSibling;
    if(next){next.focus();if(next.scrollIntoView)next.scrollIntoView({block:"center"});}
  });
  document.getElementById("download").addEventListener("click",function(){
    var lines=["row_id,rating"];
    for(var i=0;i<IDS.length;i++){lines.push(IDS[i]+","+(answers[IDS[i]]||""));}
    var blob=new Blob([lines.join("\\n")+"\\n"],{type:"text/csv"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download="ratings.csv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  });
})();
`;

function rowHtml(r: GroundRow): string {
  const q = encodeURIComponent(`${r.name} ${r.city}`);
  const radios = RATING_CODES.map((code, i) => `<label><input type="radio" name="${r.id}" value="${code}"><span>${esc(RATING_LABELS[i]!)} <kbd>${i + 1}</kbd></span></label>`).join("");
  return `<li class="row" id="${r.id}" tabindex="0">
<div class="meta"><span class="rid">${r.id}</span><span>${esc(GROUND_CATEGORY_LABEL[r.category])}</span><span>${esc(r.city)}, ${esc(countryLabel(r.country))}</span></div>
<div class="name">${esc(r.name)}</div>
<div class="links"><a href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener">Map</a><a href="https://duckduckgo.com/?q=${q}" target="_blank" rel="noopener">Search</a></div>
<fieldset>${radios}</fieldset>
</li>`;
}

/** The whole sheet as one self-contained page that works from file://. Rows are shown in id order (the caller sorts them by hash). */
export function renderSheet(rows: GroundRow[]): { html: string; hash: string } {
  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  const hash = sheetHash(rows);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Do these names exist?</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Do these names exist?</h1>
<div id="instructions">
<p>This takes about 20 minutes. Each card below is a name someone suggested for a concert in a city: a music venue, a company that could sponsor the show, or a local artist who could open. For each one, decide whether it is real.</p>
<ol>
<li>Click <b>Map</b> or <b>Search</b> to look the name up. Both are free web searches.</li>
<li>Choose one answer: exists in this city, exists but in another city, doesn't exist, or you can't tell.</li>
<li>Keyboard: press 1, 2, 3 or 4 to answer the highlighted card; the next card is then highlighted.</li>
<li>Your answers are saved in this browser as you go. When you are done, press Download CSV and send that file back.</li>
</ol>
</div>
<div class="bar"><span><span id="done">0</span> of ${ordered.length} rated</span><button id="download" type="button">Download CSV</button></div>
<ol>
${ordered.map(rowHtml).join("\n")}
</ol>
</main>
<script>${SCRIPT(hash, ordered.map((r) => r.id))}</script>
</body>
</html>
`;
  return { html, hash };
}

/** An empty ratings file: every row id, no rating. */
export function ratingsTemplateCsv(rows: GroundRow[]): string {
  return `row_id,rating\n${[...rows].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => `${r.id},`).join("\n")}\n`;
}

const unquote = (s: string): string => { const t = s.trim(); return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t; };

/** The downloaded file: row id to rating, null for a blank (unrated) row. Unknown codes and repeated ids are errors. */
export function ratingsFromCsv(csv: string): Map<string, Rating | null> {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const head = (lines[0] ?? "").split(",").map((c) => unquote(c).toLowerCase());
  if (head.length !== 2 || head[0] !== "row_id" || head[1] !== "rating") throw new Error("ratings file: header must be row_id,rating");
  const out = new Map<string, Rating | null>();
  for (const line of lines.slice(1)) {
    const comma = line.indexOf(",");
    const id = unquote(comma === -1 ? line : line.slice(0, comma));
    const rating = comma === -1 ? "" : unquote(line.slice(comma + 1));
    if (out.has(id)) throw new Error(`ratings file: row ${id} appears twice`);
    if (rating === "") { out.set(id, null); continue; }
    if (!(RATING_CODES as readonly string[]).includes(rating)) throw new Error(`ratings file: row ${id} has unknown rating "${rating}"`);
    out.set(id, rating as Rating);
  }
  return out;
}
