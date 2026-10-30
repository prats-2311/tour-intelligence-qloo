import type { PlaybookCard } from "@/lib/qloo/types";
import { coBillLine, liftLine } from "../format";
import { Caption, Row, Rows, listenLink } from "./rows";
import { num, str } from "./util";

const tagsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t !== "") : []);

/** The tags every act shares, when there are at least two acts and all carry the same non-empty list. */
const commonTags = (items: PlaybookCard["items"]): string[] => {
  if (items.length < 2) return [];
  const first = tagsOf(items[0]?.sharedTags);
  const key = first.join("\u0000");
  return first.length > 0 && items.every((it) => tagsOf(it.sharedTags).join("\u0000") === key) ? first : [];
};

export function CoBilling({ card }: { card: PlaybookCard }) {
  const shared = commonTags(card.items);
  return (
    <>
      <Rows>
        {card.items.map((it, i) => {
          const s = num(it.sharedTaste), a = num(it.localAffinity), l = num(it.lift);
          return <Row key={i} name={str(it.name)} chips={shared.length > 0 ? [] : tagsOf(it.sharedTags)} link={str(it.name) ? listenLink(str(it.name)) : undefined} aside={s !== null && a !== null && l !== null ? <span title={liftLine(s, a, l)}>{coBillLine(s, a)}</span> : "—"} />;
        })}
      </Rows>
      {shared.length > 0 && <Caption>Shared taste: {shared.join(" · ")}</Caption>}
      <Caption>How much fans share taste, and how much the city likes the act</Caption>
      {typeof card.summary?.sizeNote === "string" && <Caption>{card.summary.sizeNote}</Caption>}
    </>
  );
}
