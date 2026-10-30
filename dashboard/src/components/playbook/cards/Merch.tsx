import type { MerchDirection, PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { swatchFor } from "@/lib/qloo/merchColor";
import { num, str } from "./util";


function Tags({ card }: { card: PlaybookCard }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {card.items.slice(0, 4).map((it, i) => (
        <li key={i} className="inline-flex h-7 items-center gap-1.5 rounded-[4px] bg-paper-raised px-2 text-[13px] text-canvas-text">
          {str(it.name)} <span className="tabular-nums text-canvas-muted">{fit(num(it.affinity))}</span>
        </li>
      ))}
    </ul>
  );
}

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-0.5 pl-5 text-[15px] text-canvas-text marker:text-canvas-muted">{items.map((t) => <li key={t}>{t}</li>)}</ul>
);

export function Merch({ card, merch }: { card: PlaybookCard; merch?: MerchDirection | null }) {
  if (!merch) return <Tags card={card} />;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-canvas-muted">Creative direction — model suggestion, not Qloo data</p>
        <p className="font-title mt-1 text-[17px] text-canvas-text">{merch.title}</p>
      </div>
      <ul aria-label="Colour palette" className="flex flex-wrap gap-2">
        {merch.palette.map((name) => {
          const colour = swatchFor(name);
          return (
            <li key={name} data-palette-chip className="inline-flex items-center gap-2 rounded-full bg-paper-raised py-1 pl-1.5 pr-3 text-[13px] text-canvas-text">
              {colour && <span aria-hidden className="size-4 rounded-full border border-canvas-line" style={{ backgroundColor: colour }} />}
              {name}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="mb-1 text-[13px] text-canvas-muted">Motifs</p><List items={merch.motifs} /></div>
        <div><p className="mb-1 text-[13px] text-canvas-muted">Products</p><List items={merch.products} /></div>
      </div>
      {card.items.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-canvas-muted">Inspired by</p>
          <Tags card={card} />
        </div>
      )}
    </div>
  );
}
