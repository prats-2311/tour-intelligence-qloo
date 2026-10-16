import type { ThisWeek as Week } from "@/lib/qloo/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const day = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : DATE.format(d);
};
const LINK = "inline-flex min-h-11 min-w-8 items-center justify-center text-[13px] tabular-nums text-canvas-text underline decoration-canvas-muted underline-offset-4 hover:decoration-canvas-text";

export function ThisWeekBody({ week }: { week: Week | undefined }) {
  if (!week) return <p className="text-[13px] text-canvas-muted">Looking up this week…</p>;
  if (week.status === "unavailable") return <p className="text-[13px] text-canvas-muted">{week.message}</p>;
  const url = (id: string) => week.citations.find((c) => c.id === id)?.url;
  return (
    <div>
      {week.cached && <p className="mb-2 text-[13px] text-state-stale">From cache</p>}
      {!week.summarised ? (
        <>
          <p className="text-[15px] text-canvas-text">Sources found; summary unavailable</p>
          <ul className="mt-2 space-y-1">
            {week.citations.map((c) => (
              <li key={c.id}>
                <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center break-words text-[15px] text-canvas-text underline decoration-canvas-muted underline-offset-4">{c.title}</a>
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
                  {links.map((l) => <a key={l.n} href={l.href} target="_blank" rel="noreferrer" className={LINK}>[{l.n}]</a>)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
