import type { ReactNode } from "react";
import { mapsSearchUrl, spotifySearchUrl } from "@/lib/mapsLink";


export function Rows({ children, tour }: { children: ReactNode; /** `data-tour` value for the guided tour. */ tour?: string }) {
  return <ul data-tour={tour} className="text-[15px]">{children}</ul>;
}

/** Small muted outbound link; `data-noprint` hides it in the Tour Book print view. */
export function ExtLink({ href, text, label }: { href: string; text: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} data-noprint className="inline-flex min-h-11 items-center text-[13px] text-canvas-muted underline decoration-canvas-line underline-offset-4 outline-none hover:text-canvas-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:-my-3">{text} <span aria-hidden>↗</span></a>;
}

export const mapsLink = (name: string, city: string, country?: string) => ({ href: mapsSearchUrl(name, city, country), text: "Google Maps", label: `Open ${name} in Google Maps (new tab)` });
export const listenLink = (name: string) => ({ href: spotifySearchUrl(name), text: "Listen", label: `Listen to ${name} on Spotify (new tab)` });

export function Row({ name, aside, sub, chips, link, action }: { name: string; aside: ReactNode; sub?: string; chips?: string[]; link?: { href: string; text: string; label: string }; action?: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block break-words text-canvas-text">{name}</span>
        {sub && <span className="block text-[13px] text-canvas-muted">{sub}</span>}
        {chips && chips.length > 0 && <TagChips tags={chips} />}
        {link && <ExtLink {...link} />}
        {action}
      </span>
      <span className="max-w-[45%] shrink-0 break-words text-right tabular-nums text-canvas-text">{aside}</span>
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
