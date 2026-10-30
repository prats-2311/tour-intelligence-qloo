import { describe, expect, it } from "vitest";
import { bffStatus } from "./startupStatus.js";

describe("bffStatus", () => {
  it("with nothing set explains the sample-only mode, one line per missing service", () => {
    const t = bffStatus({}).join("\n");
    expect(t).toContain("QLOO_GATEWAY_URL not set: live runs, strategist and team workspaces are off; the sample tour still works");
    expect(t).toContain("RECORDINGS_DIR and RECORDINGS_BUCKET not set: the recorded example is private; the synthetic Lumen Vale sample is used");
    expect(t).toContain("TOUR_DATA_API_URL not set");
  });
  it("reports a local gateway and a recordings dir, without echoing secrets", () => {
    const t = bffStatus({ QLOO_GATEWAY_URL: "http://127.0.0.1:8080", RECORDINGS_DIR: "/data/rec", QLOO_API_KEY: "SECRET" }).join("\n");
    expect(t).toContain("Qloo gateway: http://127.0.0.1:8080 (local, no Google auth)");
    expect(t).toContain("Recordings: /data/rec");
    expect(t).not.toContain("SECRET");
  });
  it("a remote gateway notes it uses Google identity tokens", () => {
    expect(bffStatus({ QLOO_GATEWAY_URL: "https://gw.example.run.app" }).join("\n")).toMatch(/Google identity token/);
  });
});
