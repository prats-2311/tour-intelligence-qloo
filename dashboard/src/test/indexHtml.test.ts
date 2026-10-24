import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import { injectOriginTrial } from "../lib/originTrial";

describe("index.html", () => {
  it("has the product title", () => {
    expect(html).toMatch(/<title>Win their city · Tour Intelligence × Qloo<\/title>/);
  });
  it("has no legacy name and no committed origin-trial meta", () => {
    expect(html).not.toContain("Nova Horizon");
    expect(html).not.toMatch(/<meta[^>]*http-equiv="origin-trial"/);
  });
});

describe("origin-trial injection (VITE_WEBMCP_OT_TOKEN)", () => {
  const page = "<html><head>\n</head><body></body></html>";
  const metas = (out: string) => [...out.matchAll(/<meta http-equiv="origin-trial" content="([^"]*)">/g)].map((m) => m[1]);
  it("writes one meta per space-separated token", () => {
    expect(metas(injectOriginTrial(page, "tokA tokB"))).toEqual(["tokA", "tokB"]);
  });
  it("tolerates extra whitespace, a single token, and strips quotes", () => {
    expect(metas(injectOriginTrial(page, "  tokA   tokB \n"))).toEqual(["tokA", "tokB"]);
    expect(metas(injectOriginTrial(page, "only"))).toEqual(["only"]);
    expect(metas(injectOriginTrial(page, 'a"b'))).toEqual(["ab"]);
  });
  it("injects nothing without a token", () => {
    expect(injectOriginTrial(page, undefined)).toBe(page);
    expect(injectOriginTrial(page, "   ")).toBe(page);
  });
});
