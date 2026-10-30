import { describe, expect, it } from "vitest";
import { NEUTRAL_ANSWER, redactAnswer } from "./redactAnswer";

describe("redactAnswer (dashboard)", () => {
  it("removes only sentences naming a do-not-book act", () => {
    expect(redactAnswer("Local moments include Mid90s. Co-billing options are Ariel Pink, King Krule. Book early.")).toEqual({ text: "Local moments include Mid90s. Book early.", removed: 1 });
  });
  it("keeps list structure and drops emptied list lines", () => {
    expect(redactAnswer("1. Ariel Pink opens.\n2. King Krule opens.")).toEqual({ text: "2. King Krule opens.", removed: 1 });
  });
  it("removes non-sponsor mentions", () => {
    expect(redactAnswer("Vans fits. The ACLU also fits.").text).toBe("Vans fits.");
  });
  it("uses the neutral line when nothing remains", () => {
    expect(redactAnswer("Ariel Pink is the pick.")).toEqual({ text: NEUTRAL_ANSWER, removed: 1 });
  });
  it("is a no-op on clean text", () => {
    expect(redactAnswer("Fine 0.94.\nNext line.")).toEqual({ text: "Fine 0.94.\nNext line.", removed: 0 });
  });
});
