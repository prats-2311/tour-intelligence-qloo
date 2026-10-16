import { describe, expect, it, vi } from "vitest";
import { logQlooBaseUrl } from "../src/startupLog.js";

describe("logQlooBaseUrl", () => {
  it("prints the configured base URL and never the API key", () => {
    const log = vi.fn();
    const key = "qk_live_0123456789abcdefSECRET";
    logQlooBaseUrl({ QLOO_BASE_URL: "https://hackathon.api.qloo.com", QLOO_TRUSTED_BASE_URL: "https://hackathon.api.qloo.com", QLOO_API_KEY: key }, log);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("https://hackathon.api.qloo.com");
    expect(line).not.toContain(key);
    expect(line).not.toMatch(/key|secret/i);
  });

  it("says the harness default is used when unset, and warns when trusted URL differs", () => {
    const log = vi.fn();
    logQlooBaseUrl({}, log);
    expect(String(log.mock.calls[0]?.[0])).toContain("harness default");
    const warn = vi.fn();
    logQlooBaseUrl({ QLOO_BASE_URL: "https://a.example", QLOO_TRUSTED_BASE_URL: "https://b.example" }, warn);
    expect(String(warn.mock.calls[0]?.[0])).toContain("does not match");
  });
});
