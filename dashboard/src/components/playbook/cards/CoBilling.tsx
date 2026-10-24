import type { PlaybookCard } from "@/lib/qloo/types";
import { coBillLine, liftLine } from "../format";
import { Caption, Row, Rows } from "./rows";
import { num, str } from "./util";

const tagsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t !== "") : []);

export function CoBilling({ card }: { card: PlaybookCard }) {
  return (
    <>
      <Rows>
        {card.items.map((it, i) => {
          const s = num(it.sharedTaste), a = num(it.localAffinity), l = num(it.lift);
          return <Row key={i} name={str(it.name)} chips={tagsOf(it.sharedTags)} aside={s !== null && a !== null && l !== null ? <span title={liftLine(s, a, l)}>{coBillLine(s, a)}</span> : "—"} />;
        })}
      </Rows>
      <Caption>How much fans share taste, and how much the city likes the act</Caption>
      {typeof card.summary?.sizeNote === "string" && <Caption>{card.summary.sizeNote}</Caption>}
    </>
  );
}
