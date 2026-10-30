import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DO_NOT_BOOK, filterToolData, isDoNotBook, mentionsDoNotBook, redactAnswer, NEUTRAL_ANSWER } from "../src/displayFilters/doNotBook.js";

describe("gateway do-not-book list", () => {
  it("equals the dashboard list (read from the TS source)", () => {
    const src = readFileSync(new URL("../../../dashboard/src/lib/qloo/doNotBook.ts", import.meta.url), "utf8");
    const m = /DO_NOT_BOOK: readonly string\[\] = \[([^\]]*)\]/.exec(src)!;
    const dash = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect([...DO_NOT_BOOK]).toEqual(dash);
  });
  it("folds case and accents", () => {
    expect(isDoNotBook("ARIEL  pink")).toBe(true);
    expect(isDoNotBook("Ariél Pink")).toBe(true);
    expect(isDoNotBook("King Krule")).toBe(false);
    expect(mentionsDoNotBook("see ariel pink's set")).toBe(true);
  });
});

describe("filterToolData", () => {
  it("drops listed acts from item lists and counts them", () => {
    const r = filterToolData([{ name: "Ariel Pink" }, { name: "King Krule" }], { brands: false });
    expect(r.data).toEqual([{ name: "King Krule" }]);
    expect(r.removed).toBe(1);
  });
  it("drops listed acts nested in playbook-like cards and shared tags", () => {
    const r = filterToolData([{ kind: "co_billing", top: [{ name: "Ariel Pink" }, { name: "Beach Fossils" }] }], { brands: false });
    expect(JSON.stringify(r.data)).not.toContain("Ariel");
    expect(JSON.stringify(r.data)).toContain("Beach Fossils");
  });
  it("drops non-sponsor organisations only for brand outputs", () => {
    expect(filterToolData([{ name: "ACLU" }, { name: "Vans" }], { brands: true }).data).toEqual([{ name: "Vans" }]);
    expect(filterToolData([{ name: "ACLU" }], { brands: false }).data).toEqual([{ name: "ACLU" }]);
  });
  it("leaves null and clean data untouched", () => {
    expect(filterToolData(null, { brands: false })).toEqual({ data: null, removed: 0 });
    const d = [{ name: "Mid90s" }];
    expect(filterToolData(d, { brands: false }).removed).toBe(0);
  });
});

describe("redactAnswer", () => {
  it("removes only sentences naming a listed act", () => {
    const r = redactAnswer("Local moments include Mid90s. Co-billing options are Ariel Pink, King Krule. Book the 9pm slot.");
    expect(r.text).toBe("Local moments include Mid90s. Book the 9pm slot.");
    expect(r.removed).toBe(1);
  });
  it("keeps line structure and list lines", () => {
    const r = redactAnswer("- Ariel Pink opens.\n- King Krule opens.");
    expect(r.text).toBe("- King Krule opens.");
    expect(r.removed).toBe(1);
  });
  it("removes sentences naming a non-sponsor organisation", () => {
    expect(redactAnswer("Vans fits. ACLU also fits.").text).toBe("Vans fits.");
  });
  it("replaces an emptied answer with a neutral line", () => {
    const r = redactAnswer("Ariel Pink is a fit.");
    expect(r.text).toBe(NEUTRAL_ANSWER);
    expect(r.removed).toBe(1);
  });
  it("is a no-op on clean text", () => {
    expect(redactAnswer("Fine answer 0.94.")).toEqual({ text: "Fine answer 0.94.", removed: 0 });
  });
});
