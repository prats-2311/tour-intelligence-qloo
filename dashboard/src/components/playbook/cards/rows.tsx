import type { ReactNode } from "react";


export function Rows({ children }: { children: ReactNode }) {
  return <ul className="text-[15px]">{children}</ul>;
}

export function Row({ name, aside, sub, chips }: { name: string; aside: ReactNode; sub?: string; chips?: string[] }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block break-words text-canvas-text">{name}</span>
        {sub && <span className="block text-[13px] text-canvas-muted">{sub}</span>}
        {chips && chips.length > 0 && <TagChips tags={chips} />}
      </span>
      <span className="shrink-0 text-right tabular-nums text-canvas-text">{aside}</span>
    </li>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.map((t, i) => <span key={`${t}-${i}`} className="rounded-full bg-paper-raised px-2 py-0.5 text-[12px] text-canvas-muted">{t}</span>)}
    </span>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[13px] text-canvas-muted">{children}</p>;
}
