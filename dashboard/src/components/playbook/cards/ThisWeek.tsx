import { History } from "lucide-react";
import type { ThisWeek as Week } from "@/lib/qloo/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null): string | null => {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const mon = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && mon ? `${Number(m[3])} ${mon}` : null;
};
const LINK = "inline-flex min-h-11 min-w-11 items-center justify-center text-[13px] tabular-nums text-canvas-text underline decoration-canvas-muted underline-offset-4 hover:decoration-canvas-text";

/** A summarised, ok week with nothing in it: the card has nothing to say, so it is left out. */
export const isEmptyWeek = (w: Week | undefined): boolean => w?.status === "ok" && w.summarised && w.items.length === 0;

export function ThisWeekBody({ week }: { week: Week | undefined }) {
  if (!week) return <p className="text-[13px] text-canvas-muted">Looking up this week…</p>;
  if (week.status === "unavailable") return <p className="text-[13px] text-canvas-muted">{week.message}</p>;
  const url = (id: string) => week.citations.find((c) => c.id === id)?.url;
  return (
    <div>
      {week.cached && <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-state-stale"><History size={14} strokeWidth={1.75} aria-hidden />From cache</p>}
      {!week.summarised ? (
        <>
          <p className="text-[15px] text-canvas-text">Sources found; summary unavailable</p>
          <ul className="mt-2 space-y-1">
            {week.citations.map((c) => (
              <li key={c.id}>
                <a data-cite href={c.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center break-words text-[15px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{c.title}</a>
              </li>
            ))}
          </ul>
        </>
      ) : week.items.length === 0 ? (
        <p className="text-[15px] text-canvas-muted">Nothing notable found for these dates</p>
      ) : (
        <ul>
          {week.items.map((it, i) => {
            const links = it.citations.map((id, n) => ({ n: n + 1, href: url(id) })).filter((l): l is { n: number; href: string } => !!l.href);
            const when = day(it.date);
            return (
              <li key={i} className="py-3">
                <p className="text-[15px] leading-[1.45] text-canvas-text">{it.text}</p>
                <div className="flex flex-wrap items-center gap-x-1">
                  {when && <span className="mr-2 text-[13px] tabular-nums text-canvas-muted">{when}</span>}
                  {links.map((l) => <a key={l.n} data-cite href={l.href} target="_blank" rel="noreferrer" className={LINK}>[{l.n}]</a>)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
