import type { PlaybookCard } from "@/lib/qloo/types";
import { zoneDisplayLabel } from "@/lib/qloo/zones";
import { HINT } from "@/lib/qloo/numberKey";
import { pct } from "../format";
import { ExtLink, mapsLink } from "./rows";
import { num, str } from "./util";

const HEXES: Array<[number, number]> = [[50, 30], [78, 30], [36, 54], [64, 54], [92, 54], [50, 78], [78, 78]];
const hex = (cx: number, cy: number, r = 14) =>
  Array.from({ length: 6 }, (_, i) => `${(cx + r * Math.cos((Math.PI / 3) * i + Math.PI / 6)).toFixed(1)},${(cy + r * Math.sin((Math.PI / 3) * i + Math.PI / 6)).toFixed(1)}`).join(" ");

export function PromoZones({ card, city, country }: { card: PlaybookCard; city: string; country?: string }) {
  if (card.status === "empty" || card.items.length === 0) {
    return (
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 128 108" aria-hidden className="h-[72px] w-[86px] shrink-0">
          {HEXES.map(([x, y]) => <polygon key={`${x}-${y}`} points={hex(x, y)} fill="none" stroke="#a4a094" strokeOpacity={0.4} strokeWidth={1.5} />)}
        </svg>
        <p className="text-[13px] text-canvas-muted">Qloo returned no neighbourhood data for {city}</p>
      </div>
    );
  }
  const sorted = [...card.items].sort((a, b) => (num(b.share) ?? 0) - (num(a.share) ?? 0));
  const rows = sorted.slice(0, 5);
  const top3 = sorted.slice(0, 3).reduce((s, it) => s + (num(it.share) ?? 0), 0);
  return (
    <>
      <p className="mb-2 text-[13px] font-medium tabular-nums text-canvas-muted">Top 3 hold {Math.round(top3 * 100)}% of in-city heat</p>
      <table className="w-full text-[15px]">
        <thead>
          <tr /* taste-skill-ignore: DESIGN 3.1 column head */ className="text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-canvas-muted">
            <th scope="col" className="py-1 font-semibold">Zone</th>
            <th scope="col" title={HINT.share} className="py-1 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody /* taste-skill-ignore: real table rules */ className="divide-y divide-canvas-line">
          {rows.map((it, i) => (
            <tr key={i} className="h-11">
              <td className="break-words pr-3 text-canvas-text">
                {zoneDisplayLabel(str(it.label), city)}
                {str(it.label) && <span className="block"><ExtLink {...mapsLink(str(it.label), city, country)} /></span>}
              </td>
              <td className="text-right tabular-nums text-canvas-text">{pct(num(it.share) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
