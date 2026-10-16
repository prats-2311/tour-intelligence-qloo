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
  it("resets per-session counts when the UTC day rolls", () => {
    let t = Date.UTC(2026, 9, 20, 12);
    const b = new BudgetGuard({ perSession: 2, perDay: 100, now: () => t });
    b.reserve("s"); b.reserve("s");
    expect(() => b.reserve("s")).toThrow(BudgetExceededError);
    t = Date.UTC(2026, 9, 21, 0, 1);
    expect(() => b.reserve("s")).not.toThrow();
    expect(b.remaining("s").session).toBe(1);
  });
  describe("public MCP sessions", () => {
    const make = (now = () => 0) => new BudgetGuard({ perSession: 100, perDay: 10, publicPerDay: 3, now });
    it("stop at the public ceiling while dashboard sessions continue", () => {
      const b = make();
      b.reserve("mcp-public-a"); b.reserve("mcp-public-b"); b.reserve("mcp-public-a");
      let caught: unknown;
      try { b.reserve("mcp-public-c"); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(BudgetExceededError);
      expect((caught as BudgetExceededError).scope).toBe("public");
      expect(() => b.reserve("dash-1")).not.toThrow();
    });
    it("count toward the global daily ceiling", () => {
      const b = new BudgetGuard({ perSession: 100, perDay: 4, publicPerDay: 3, now: () => 0 });
      b.reserve("mcp-public-a"); b.reserve("mcp-public-a"); b.reserve("mcp-public-a");
      b.reserve("dash-1");
      expect(() => b.reserve("dash-2")).toThrow(BudgetExceededError);
    });
    it("are checked before the global ceiling and do not consume it when refused", () => {
      const b = new BudgetGuard({ perSession: 100, perDay: 3, publicPerDay: 1, now: () => 0 });
      b.reserve("mcp-public-a");
      let scope = "";
      try { b.reserve("mcp-public-a"); } catch (e) { scope = (e as BudgetExceededError).scope; }
      expect(scope).toBe("public");
      expect(b.remaining("dash-1").daily).toBe(2);
    });
    it("reset the next UTC day and default the public ceiling to 400", () => {
      let t = Date.UTC(2026, 9, 20, 12);
      const b = make(() => t);
      b.reserve("mcp-public-a"); b.reserve("mcp-public-a"); b.reserve("mcp-public-a");
      expect(() => b.reserve("mcp-public-a")).toThrow(BudgetExceededError);
      t = Date.UTC(2026, 9, 21, 0, 1);
      expect(() => b.reserve("mcp-public-a")).not.toThrow();
      const d = new BudgetGuard({ perSession: 1000, perDay: 1000, now: () => 0 });
      for (let i = 0; i < 400; i++) d.reserve(`mcp-public-${i}`);
      expect(() => d.reserve("mcp-public-x")).toThrow(BudgetExceededError);
    });
  });
});
