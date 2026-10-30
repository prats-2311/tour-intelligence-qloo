import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { AdvanceRisks } from "@/lib/qloo/types";
import { advanceNotes } from "./advance";

const ok = (over: Partial<AdvanceRisks> = {}): AdvanceRisks => ({
  weather: { status: "unavailable", message: "x" },
  holidays: { status: "ok", source: "s", sourceUrl: "u", items: [{ date: "2027-03-20", name: "Holy Week", localName: "Semana Santa", near: true }, { date: "2027-05-01", name: "Labour Day", localName: "x", near: false }] },
  visa: { status: "ok", summary: "s", leadTime: "6-8 weeks", items: [], sources: [], cached: false },
  equipment: { status: "unavailable", message: "x" },
  generatedAt: "t", ...over,
});

describe("advanceNotes (reads the session's cache, never fetches)", () => {
  it("is empty when nothing is loaded for the city", () => {
    const qc = new QueryClient();
    expect(advanceNotes(qc, "gdl")).toEqual([]);
  });
  it("gives the visa lead time and the nearby holidays for that city only", () => {
    const qc = new QueryClient();
    qc.setQueryData(["advance", true, "showcase", "gdl", "2027-03-01", "2027-04-01", ""], ok());
    expect(advanceNotes(qc, "gdl")).toEqual(["Visa lead time: 6-8 weeks", "Holiday near dates: Holy Week (2027-03-20)"]);
    expect(advanceNotes(qc, "mex")).toEqual([]);
  });
  it("ignores lookups that were unavailable", () => {
    const qc = new QueryClient();
    qc.setQueryData(["advance", true, "showcase", "gdl", "a", "b", ""], ok({ visa: { status: "unavailable", message: "down" }, holidays: { status: "unavailable", message: "down" } }));
    expect(advanceNotes(qc, "gdl")).toEqual([]);
  });
});
