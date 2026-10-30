import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { advanceNotes } from "./advance";

/** Advance risk notes per city from what this session already loaded (subscribes to the cache, never fetches). */
export function useAdvanceNotes(cityIds: string[]): Record<string, string[]> {
  const qc = useQueryClient();
  const idsKey = cityIds.join(",");
  const read = () => Object.fromEntries(cityIds.map((id) => [id, advanceNotes(qc, id)]));
  const [notes, setNotes] = useState(read);
  useEffect(() => {
    const sync = () => setNotes((prev) => { const next = read(); return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; });
    sync();
    return qc.getQueryCache().subscribe(sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, idsKey]);
  return notes;
}
