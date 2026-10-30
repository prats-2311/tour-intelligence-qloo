import { describe, expect, it } from "vitest";
import { DOCUMENT_LIMITS, validateDocuments } from "../src/strategist/safety.js";

const doc = (over: Record<string, unknown> = {}) => ({ id: "d1", name: "recap.pdf", pages: [{ n: 1, text: "Los Angeles drew 1,200." }], ...over });

describe("validateDocuments", () => {
  it("treats absent documents as none", () => {
    expect(validateDocuments(undefined)).toEqual({ ok: true, documents: [] });
    expect(validateDocuments(null)).toEqual({ ok: true, documents: [] });
  });
  it("accepts up to 3 well-formed documents", () => {
    const r = validateDocuments([doc(), doc({ id: "d2" }), doc({ id: "d3" })]);
    expect(r.ok).toBe(true);
    expect(validateDocuments([doc(), doc({ id: "d2" }), doc({ id: "d3" }), doc({ id: "d4" })]).ok).toBe(false);
  });
  it("rejects non-arrays, duplicate or malformed ids, empty page lists", () => {
    expect(validateDocuments("x").ok).toBe(false);
    expect(validateDocuments([doc(), doc()]).ok).toBe(false);
    expect(validateDocuments([doc({ id: "a b]" })]).ok).toBe(false);
    expect(validateDocuments([doc({ pages: [] })]).ok).toBe(false);
  });
  it("limits names to 120 characters", () => {
    expect(validateDocuments([doc({ name: "n".repeat(120) })]).ok).toBe(true);
    expect(validateDocuments([doc({ name: "n".repeat(121) })]).ok).toBe(false);
    expect(validateDocuments([doc({ name: "" })]).ok).toBe(false);
  });
  it("requires integer page numbers from 1", () => {
    for (const n of [1.5, 0, -1, "2", null]) expect(validateDocuments([doc({ pages: [{ n, text: "x" }] })]).ok).toBe(false);
    expect(validateDocuments([doc({ pages: [{ n: 1, text: 1 }] })]).ok).toBe(false);
  });
  it("limits pages per document and total characters", () => {
    const pages = (k: number) => Array.from({ length: k }, (_, i) => ({ n: i + 1, text: "x" }));
    expect(validateDocuments([doc({ pages: pages(DOCUMENT_LIMITS.pagesPerDoc) })]).ok).toBe(true);
    expect(validateDocuments([doc({ pages: pages(DOCUMENT_LIMITS.pagesPerDoc + 1) })]).ok).toBe(false);
    expect(validateDocuments([doc({ pages: [{ n: 1, text: "x".repeat(DOCUMENT_LIMITS.totalChars) }] })]).ok).toBe(true);
    expect(validateDocuments([doc({ pages: [{ n: 1, text: "x".repeat(DOCUMENT_LIMITS.totalChars) }, { n: 2, text: "y" }] })]).ok).toBe(false);
    expect(validateDocuments([doc({ pages: [{ n: 1, text: "x".repeat(40_000) }] }), doc({ id: "d2", pages: [{ n: 1, text: "x".repeat(20_001) }] })]).ok).toBe(false);
  });
  it("strips control characters and neutralises citation markers inside page text", () => {
    const r = validateDocuments([doc({ pages: [{ n: 1, text: "a\u0007b [doc:d9 p.1] 5 sold " }] })]);
    expect(r.ok && r.documents[0]!.pages[0]!.text).toBe("ab [ doc:d9 p.1] 5 sold");
  });
});
