/** Text extraction for the strategist's private documents. Everything here runs in the browser: files are read locally and only their text ever leaves, inside a strategist request. */

export interface AttachedDoc { id: string; name: string; pages: Array<{ n: number; text: string }>; /** Set when the file was cut short while reading. */ note?: string }

export const DOC_LIMITS = { files: 3, pages: 40, chars: 60_000 } as const;
export const ACCEPT = ".pdf,.txt,.md,.csv";
const SECTION_CHARS = 3000;
const TEXT_EXT = /\.(txt|md|csv)$/i;

const readBuffer = (f: File): Promise<ArrayBuffer> => (typeof f.arrayBuffer === "function" ? f.arrayBuffer() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); }));
const readText = (f: File): Promise<string> => (typeof f.text === "function" ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }));

/** Plain text has no pages, so it is cut into numbered sections at line breaks; a citation then points at a section. */
function sections(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if (cur !== "" && cur.length + 1 + line.length > SECTION_CHARS) { out.push(cur); cur = line; } else cur = cur === "" && out.length === 0 ? line : `${cur}\n${line}`;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

async function pdfPages(file: File): Promise<{ pages: string[]; total: number }> {
  const { loadPdfjs } = await import("./pdfLoader");
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await readBuffer(file)) }).promise;
    const last = Math.min(doc.numPages, DOC_LIMITS.pages);
    const pages: string[] = [];
    for (let n = 1; n <= last; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ").trim());
    }
    return { pages, total: doc.numPages };
  } catch {
    throw new Error(`Could not read ${file.name}`);
  }
}

export async function readDocument(file: File): Promise<AttachedDoc> {
  const name = file.name;
  if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
    const { pages, total } = await pdfPages(file);
    if (pages.every((p) => p === "")) throw new Error(`No readable text found in ${name} (scanned PDFs are not supported)`);
    return { id: "", name, pages: pages.map((text, i) => ({ n: i + 1, text })), ...(total > pages.length ? { note: `Only the first ${pages.length} pages of ${name} were read.` } : {}) };
  }
  if (!TEXT_EXT.test(name)) throw new Error("Only .pdf, .txt, .md and .csv files can be added");
  const text = (await readText(file)).replace(/\r\n?/g, "\n");
  const parts = sections(text);
  if (parts.length === 0) throw new Error(`No readable text found in ${name}`);
  return { id: "", name, pages: parts.map((t, i) => ({ n: i + 1, text: t })) };
}

const used = (docs: AttachedDoc[]): number => docs.reduce((n, d) => n + d.pages.reduce((m, p) => m + p.text.length, 0), 0);
const freeId = (docs: AttachedDoc[]): string => { for (let i = 1; ; i++) if (!docs.some((d) => d.id === `d${i}`)) return `d${i}`; };

/** Adds incoming files to the attached set within the limits (3 files, 60,000 characters). Returns the new set and a note for everything that was cut or skipped. */
export function fitDocuments(existing: AttachedDoc[], incoming: AttachedDoc[], newId: (docs: AttachedDoc[]) => string = freeId): { docs: AttachedDoc[]; notes: string[] } {
  const docs = [...existing];
  const notes: string[] = [];
  for (const d of incoming) {
    if (docs.length >= DOC_LIMITS.files) { notes.push(`Only ${DOC_LIMITS.files} files can be added at a time, so ${d.name} was skipped.`); continue; }
    let left = DOC_LIMITS.chars - used(docs);
    if (left <= 0) { notes.push(`${d.name} was not added: the ${DOC_LIMITS.chars.toLocaleString("en-US")} character limit is already used.`); continue; }
    const pages: AttachedDoc["pages"] = [];
    for (const p of d.pages) {
      if (left <= 0) break;
      const text = p.text.slice(0, left);
      pages.push({ n: p.n, text });
      left -= text.length;
    }
    const lastKept = pages.length - 1;
    const cut = pages.length < d.pages.length || pages[lastKept]!.text.length < d.pages[lastKept]!.text.length;
    if (cut) notes.push(pages.length === 1 ? `Only the first page of ${d.name} was read.` : `Only the first ${pages.length} pages of ${d.name} were read.`);
    else if (d.note) notes.push(d.note);
    docs.push({ id: newId(docs), name: d.name, pages, ...(cut ? { note: notes.at(-1)! } : d.note ? { note: d.note } : {}) });
  }
  return { docs, notes };
}
