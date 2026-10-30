import { describe, expect, it } from "vitest";
import { compare } from "../src/backtest/proofResults.js";

describe("compare wording", () => {
  it("pluralises city as cities", () => {
    const s = compare({ start: "Qloo", inline: "Qloo" }, { start: "The LLM", inline: "the LLM" }, 0.8, 1, { wins: 0, losses: 7, ties: 2, pairs: 9, p: 0.016 } as never, "share in city", "city");
    expect(s).toContain("over 9 cities");
    expect(s).not.toContain("citys");
  });
});
