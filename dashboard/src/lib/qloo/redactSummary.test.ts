import { describe, expect, it } from "vitest";
import { REDACTION_NOTE, redactSummary } from "./redactSummary";

describe("redactSummary (sentence-level)", () => {
  it("drops only the sentences that name a listed act or a non-sponsor", () => {
    const r = redactSummary("Sponsor fit is high at 0.94. Fans also rank Ariel Pink highly! Does UNICEF matter? The venue is small.");
    expect(r).toEqual({ text: "Sponsor fit is high at 0.94. The venue is small.", removed: 2 });
  });
  it("handles newlines as sentence breaks and keeps the line structure", () => {
    const r = redactSummary("Step one is fine.\nAriel Pink shows up here\nStep three is fine too. Done.");
    expect(r.text).toBe("Step one is fine.\nStep three is fine too. Done.");
    expect(r.removed).toBe(1);
  });
  it("returns the text untouched when nothing is listed", () => {
    expect(redactSummary("All good. Nothing to hide.")).toEqual({ text: "All good. Nothing to hide.", removed: 0 });
  });
  it("leaves nothing when every sentence is removed", () => {
    expect(redactSummary("Ariel Pink. Also Ariel Pink again.")).toEqual({ text: "", removed: 2 });
  });
  it("note wording counts correctly", () => {
    expect(REDACTION_NOTE(1)).toBe("1 sentence removed (do-not-book list or not a sponsor)");
    expect(REDACTION_NOTE(3)).toBe("3 sentences removed (do-not-book list or not a sponsor)");
  });
});
