import type { QueryClient } from "@tanstack/react-query";
import type { AdvanceRisks } from "@/lib/qloo/types";

/**
 * Risk notes for a city from Advance data that is ALREADY in this session's query cache (key ["advance", sample, sampleSet, cityId, ...],
 * see CityPlaybook). Reads the cache only: it never starts a lookup.
 */
export function advanceNotes(qc: QueryClient, cityId: string): string[] {
  const hits = qc.getQueriesData<AdvanceRisks>({ queryKey: ["advance"] }).filter(([key, data]) => key[3] === cityId && !!data);
  const out: string[] = [];
  for (const [, data] of hits) {
    if (data!.visa?.status === "ok" && data!.visa.leadTime) out.push(`Visa lead time: ${data!.visa.leadTime}`);
    if (data!.holidays?.status === "ok") {
      const near = data!.holidays.items.filter((h) => h.near);
      if (near.length) out.push(`Holiday near dates: ${near.map((h) => `${h.name} (${h.date})`).join(", ")}`);
    }
  }
  return [...new Set(out)];
}
