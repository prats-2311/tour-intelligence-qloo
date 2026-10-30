import type { CardKind } from "@/lib/qloo/types";
import { scrollToCard, type HeroWhy } from "./heroWhy";

/** The muted one-line "why" under a hero tile value; the text links to its card below. */
export function WhyLine({ why, onGo, className = "" }: { why: HeroWhy; onGo?: (kind: CardKind) => void; className?: string }) {
  return (
    <a
      href={`#card-${why.card}`}
      onClick={(e) => { e.preventDefault(); (onGo ?? scrollToCard)(why.card); }}
      className={`-my-[15px]! py-[15px] text-[12px] font-normal text-canvas-muted underline-offset-4 hover:text-canvas-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${className}`}
    >{why.text}</a>
  );
}
