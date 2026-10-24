import { describe, expect, it } from "vitest";
import { firstOkName } from "./playbookFacts";
import type { PlaybookCard } from "./types";

const card = (kind: PlaybookCard["kind"], status: "ok" | "empty", name?: unknown): PlaybookCard => ({ kind, status, items: name === undefined ? [] : [{ name }], refs: [], warnings: [] });

describe("firstOkName", () => {
  it("returns the first item's name only for an ok card with a named item", () => {
    expect(firstOkName([card("co_billing", "ok", "Ariel")], "co_billing")).toBe("Ariel");
    expect(firstOkName([card("co_billing", "empty", "Ariel")], "co_billing")).toBeNull();
    expect(firstOkName([card("co_billing", "ok")], "co_billing")).toBeNull();
    expect(firstOkName([card("co_billing", "ok", "")], "co_billing")).toBeNull();
    expect(firstOkName([], "co_billing")).toBeNull();
  });
});
