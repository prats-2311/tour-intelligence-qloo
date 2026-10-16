// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getSessionId } from "./session";

describe("getSessionId", () => {
  beforeEach(() => localStorage.clear());
  it("creates once and reuses", () => {
    const a = getSessionId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(getSessionId()).toBe(a);
  });
  it("replaces an invalid stored value", () => {
    localStorage.setItem("qlooSessionId", "x".repeat(200));
    expect(getSessionId().length).toBeLessThanOrEqual(128);
  });
});
