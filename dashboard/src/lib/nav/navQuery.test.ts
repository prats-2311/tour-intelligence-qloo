import { describe, expect, it } from "vitest";
import { navHref } from "./navQuery";

describe("navHref: keeps showcase, sample and ws across nav links", () => {
  it("keeps ?showcase=1 from the current URL", () => expect(navHref("/tours/book", "?showcase=1", "")).toBe("/tours/book?showcase=1"));
  it("keeps ?sample=long", () => expect(navHref("/tours/board", "?sample=long", "")).toBe("/tours/board?sample=long"));
  it("keeps ws next to showcase", () => {
    const h = navHref("/tours/book", "?ws=abc123&showcase=1", "");
    expect(new URLSearchParams(h.split("?")[1]).get("ws")).toBe("abc123");
    expect(new URLSearchParams(h.split("?")[1]).get("showcase")).toBe("1");
  });
  it("drops page-local params such as mode and new", () => expect(navHref("/tours/board", "?mode=without&new=1&sample=1", "")).toBe("/tours/board?sample=1"));
  it("falls back to the run's own query when the URL has none (a bare /tours/board that loaded the showcase)", () => expect(navHref("/tours/book", "", "?showcase=1")).toBe("/tours/book?showcase=1"));
  it("keeps ?showcase=routing from the run", () => expect(navHref("/tours/book", "", "?showcase=routing")).toBe("/tours/book?showcase=routing"));
  it("the URL wins over the run's query, and ws is added to it", () => expect(navHref("/x", "?ws=w1&sample=1", "?showcase=1")).toBe("/x?sample=1&ws=w1"));
  it("adds ws to the run's query when the URL only has ws", () => expect(navHref("/x", "?ws=w1", "?showcase=1")).toBe("/x?showcase=1&ws=w1"));
  it("no params gives a bare path", () => expect(navHref("/proof", "", "")).toBe("/proof"));
  it("keeps the params already on the target (a playbook link that carries its own ?showcase=1)", () => expect(navHref("/tours/playbook/9?showcase=1", "?ws=w", "")).toBe("/tours/playbook/9?showcase=1&ws=w"));
});
