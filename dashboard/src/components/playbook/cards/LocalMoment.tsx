import type { PlaybookCard } from "@/lib/qloo/types";
import { fit } from "../format";
import { Row, Rows } from "./rows";
import { num, str } from "./util";

const TYPE_LABEL: Record<string, string> = { artist: "Artist", place: "Place", movie: "Film", tv_show: "TV" };

export function LocalMoment({ card }: { card: PlaybookCard }) {
  return (
    <Rows>
      {card.items.map((it, i) => (
        <Row key={i} name={str(it.name)} sub={TYPE_LABEL[str(it.type)]} aside={fit(num(it.affinity))} />
      ))}
    </Rows>
  );
}
