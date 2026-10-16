import { describe, expect, it } from "vitest";
import { liveSuggestions } from "./strategistSuggestions";
import type { StrategistContext } from "./types";

const city = (id: string, name: string, verdict: string, winnability: number | null) => ({ id, name, country: "MX", verdict, fanHeat: 50, activation: 50, winnability });

describe("liveSuggestions", () => {
  const ctx: StrategistContext = { focusCityId: "2", cities: [city("1", "Monterrey", "play", 80), city("2", "Guadalajara", "consider", 40), city("3", "Puebla", "hidden_goldmine", 60)] };
  it("builds three board-aware questions with no digits", () => {
    const s = liveSuggestions(ctx);
    expect(s).toEqual(["Why is Puebla ranked here?", "Who should open in Guadalajara?", "Which market is riskiest?"]);
    expect(s.every((q) => !/\d/.test(q))).toBe(true);
  });
  it("falls back to the top-winnability city without a goldmine or focus", () => {
    const s = liveSuggestions({ cities: [city("1", "Monterrey", "play", 80), city("2", "Leon", "play", 90)] });
    expect(s).toEqual(["Why is Leon ranked here?", "Who should open in Leon?", "Which market is riskiest?"]);
  });
  it("stays generic with an empty board", () => {
    expect(liveSuggestions({})).toEqual(["Which market should we prioritise?", "Who should open the tour?", "Which market is riskiest?"]);
  });
});
