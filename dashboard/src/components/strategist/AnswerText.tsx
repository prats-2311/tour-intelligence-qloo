import { FileText } from "lucide-react";
import type { ReactNode } from "react";

/** Markdown list markers at line start and "Step N" ordinals: structure, not claimed figures (mirrors the gateway check). */
const LIST_MARKER = /^[ \t]*(?:[-*+][ \t]+)?\**\d{1,2}[.)]\**(?=[ \t])/gm;
const STEP_ORDINAL = /\bsteps?\s+\d{1,2}\b/gi;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const bare = (t: string): string => (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?|^\d+(?:\.\d+)?/.exec(t)?.[0] ?? t).replace(/,/g, "");
const numbersIn = (t: string): Set<string> => new Set((t.match(NUMBER) ?? []).map((n) => n.replace(/,/g, "")));

/** Of the gateway-flagged tokens, drops only those that appear in the text solely as list markers or step ordinals. */
export function realUnsupportedNumbers(text: string, flagged: string[]): string[] {
  const all = numbersIn(text), left = numbersIn(text.replace(LIST_MARKER, " ").replace(STEP_ORDINAL, " "));
  return flagged.filter((t) => !all.has(bare(t)) || left.has(bare(t)));
}

/** A citation of the user's own file; distinct from the Qloo evidence chips. */
function DocCite({ id, page, name }: { id: string; page: string; name: string | undefined }) {
  const label = name ?? "Your file";
  return (
    <span data-doc-cite data-source="your-file" data-doc-id={id} aria-label={name ? `From your file ${name}, page ${page}` : `From your file, page ${page}`}
      className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-canvas-line bg-canvas px-1.5 py-0.5 align-baseline text-[12px] text-canvas-muted">
      <FileText size={12} aria-hidden />{`${label}, p. ${page}`}
    </span>
  );
}

/** `**bold**`, `*italic*` and `[doc:<id> p.<n>]` citations as React nodes. Anything else, angle brackets included, stays plain text. */
function inline(text: string, key: string, names: Record<string, string> = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*\n]+?)\*\*|\*([^*\s][^*\n]*?)\*|\[doc:([A-Za-z0-9_-]{1,40}) p\.(\d{1,4})\]/g;
  let last = 0, i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[3] !== undefined) out.push(<DocCite key={`${key}-${i++}`} id={m[3]} page={m[4]!} name={names[m[3]]} />);
    else out.push(m[1] !== undefined ? <strong key={`${key}-${i++}`}>{m[1]}</strong> : <em key={`${key}-${i++}`}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const OL = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;

/** The strategist answer's minimal markdown: bold, italics, line breaks, numbered and bulleted lists. No HTML is ever injected. */
export function AnswerText({ text, documentNames }: { text: string; documentNames?: Record<string, string> }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length === 0) return;
    const k = `p${blocks.length}`;
    blocks.push(<p key={k}>{para.flatMap((l, n) => (n === 0 ? inline(l, `${k}-${n}`, documentNames) : [<br key={`${k}-br${n}`} />, ...inline(l, `${k}-${n}`, documentNames)]))}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, n) => <li key={n}>{inline(it, `${k}-${n}`, documentNames)}</li>);
    blocks.push(list.ordered
      ? <ol key={k} start={list.start} className="ml-5 list-decimal">{items}</ol>
      : <ul key={k} className="ml-5 list-disc">{items}</ul>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const o = OL.exec(line), u = o ? null : UL.exec(line);
    if (o || u) {
      flushPara();
      const ordered = !!o;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, start: o ? Number(o[1]) : 1, items: [] };
      list.items.push((o ?? u)![o ? 2 : 1]!);
    } else if (line.trim() === "") { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return <div className="flex flex-col gap-2 [&_li]:pl-1">{blocks}</div>;
}
