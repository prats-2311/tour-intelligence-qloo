import { describe, expect, it } from "vitest";
import { strategistErrorCopy, STRATEGIST_OFFLINE } from "./strategistErrorCopy";

describe("strategistErrorCopy", () => {
  it("maps gateway and transport failures to plain language, never internal text", () => {
    for (const [code, message] of [["HTTP_503", "Qloo gateway not configured"], ["HTTP_502", "request failed: 502"], ["UNAVAILABLE", "upstream ECONNREFUSED"], ["INTERNAL", "TypeError: fetch failed"]] as const) {
      expect(strategistErrorCopy(code, message)).toBe(STRATEGIST_OFFLINE);
    }
    expect(STRATEGIST_OFFLINE).toBe("The live strategist isn't available right now. Recorded answers still work.");
  });
  it("keeps deliberate, user-facing messages from the service", () => {
    expect(strategistErrorCopy("CAPPED", "Today's live question budget is used up.")).toBe("Today's live question budget is used up.");
  });
});
