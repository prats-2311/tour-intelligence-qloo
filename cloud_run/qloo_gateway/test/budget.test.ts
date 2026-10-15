import { describe, expect, it } from "vitest";
import { BudgetExceededError, BudgetGuard } from "../src/budget.js";

describe("BudgetGuard", () => {
  it("allows up to perSession calls per session", () => {
    const b = new BudgetGuard({ perSession: 2, perDay: 100, now: () => 0 });
    b.reserve("s1"); b.reserve("s1");
    expect(() => b.reserve("s1")).toThrow(BudgetExceededError);
    expect(() => b.reserve("s2")).not.toThrow();
  });
  it("enforces the daily ceiling across sessions and resets the next UTC day", () => {
    let t = Date.UTC(2026, 9, 20, 23, 59);
    const b = new BudgetGuard({ perSession: 10, perDay: 2, now: () => t });
    b.reserve("a"); b.reserve("b");
    expect(() => b.reserve("c")).toThrow(BudgetExceededError);
    let caught: unknown;
    try { b.reserve("c"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as BudgetExceededError).scope).toBe("daily");
    t = Date.UTC(2026, 9, 21, 0, 1);
    expect(() => b.reserve("c")).not.toThrow();
  });
  it("reports remaining", () => {
    const b = new BudgetGuard({ perSession: 5, perDay: 9, now: () => 0 });
    b.reserve("s");
    expect(b.remaining("s")).toEqual({ session: 4, daily: 8 });
  });
});
