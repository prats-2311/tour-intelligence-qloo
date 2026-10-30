// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSessionId, isTestTraffic, sessionHeaders } from "./session";

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

describe("test traffic marking", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, "", "/"); });
  afterEach(() => window.history.replaceState(null, "", "/"));
  it("is off by default: no x-tiq-test header, a plain session id", () => {
    expect(isTestTraffic()).toBe(false);
    expect(sessionHeaders()).toEqual({ "x-session-id": getSessionId() });
    expect(getSessionId()).not.toMatch(/^e2e-/);
  });
  it("localStorage tiq.test=1 sends x-tiq-test: 1 and an e2e- session id", () => {
    localStorage.setItem("tiq.test", "1");
    expect(isTestTraffic()).toBe(true);
    const h = sessionHeaders();
    expect(h["x-tiq-test"]).toBe("1");
    expect(h["x-session-id"]).toMatch(/^e2e-[0-9a-f-]{36}$/);
    expect(h["x-session-id"].length).toBeLessThanOrEqual(128);
  });
  it("tiq.test other than 1 is ignored", () => {
    localStorage.setItem("tiq.test", "0");
    expect(isTestTraffic()).toBe(false);
  });
  it("?e2e=1 marks the tab, and keeps marking after the query is gone", () => {
    window.history.replaceState(null, "", "/tours/board?e2e=1");
    expect(sessionHeaders()["x-tiq-test"]).toBe("1");
    window.history.replaceState(null, "", "/tours/playbook/1");
    expect(sessionHeaders()["x-tiq-test"]).toBe("1");
  });
});
