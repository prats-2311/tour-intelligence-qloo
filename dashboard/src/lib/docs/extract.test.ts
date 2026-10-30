// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdf = { pages: [] as string[][], numPages: 0 };
vi.mock("./pdfLoader", () => ({
  loadPdfjs: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pdf.numPages,
        getPage: async (n: number) => ({ getTextContent: async () => ({ items: (pdf.pages[n - 1] ?? []).map((str) => ({ str })) }) }),
      }),
    }),
  }),
}));

import { DOC_LIMITS, fitDocuments, readDocument, type AttachedDoc } from "./extract";

const file = (name: string, content: string | ArrayBuffer, type = "") => new File([content], name, { type });
const doc = (id: string, name: string, pages: string[]): AttachedDoc => ({ id, name, pages: pages.map((text, i) => ({ n: i + 1, text })) });
beforeEach(() => { pdf.pages = []; pdf.numPages = 0; });

describe("readDocument", () => {
  it("extracts PDF text page by page in the browser (pdfjs)", async () => {
    pdf.numPages = 2; pdf.pages = [["Los Angeles", "drew 1,200"], ["Austin sold 340"]];
    const d = await readDocument(file("recap.pdf", new ArrayBuffer(8), "application/pdf"));
    expect(d.name).toBe("recap.pdf");
    expect(d.pages).toEqual([{ n: 1, text: "Los Angeles drew 1,200" }, { n: 2, text: "Austin sold 340" }]);
  });
  it("reads only the first 40 pages of a long PDF and says so", async () => {
    pdf.numPages = 55; pdf.pages = Array.from({ length: 55 }, (_, i) => [`page ${i + 1}`]);
    const d = await readDocument(file("long.pdf", new ArrayBuffer(8)));
    expect(d.pages).toHaveLength(DOC_LIMITS.pages);
    expect(d.pages.at(-1)!.n).toBe(40);
    expect(d.note).toBe("Only the first 40 pages of long.pdf were read.");
  });
  it("reads .txt, .md and .csv as text, split into numbered sections", async () => {
    for (const name of ["a.txt", "a.md", "a.csv"]) {
      const d = await readDocument(file(name, "one\ntwo"));
      expect(d.pages).toEqual([{ n: 1, text: "one\ntwo" }]);
    }
    const long = Array.from({ length: 400 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
    const d = await readDocument(file("big.txt", long));
    expect(d.pages.length).toBeGreaterThan(1);
    expect(d.pages.map((p) => p.n)).toEqual(d.pages.map((_, i) => i + 1));
    expect(d.pages.map((p) => p.text).join("\n")).toBe(long);
  });
  it("rejects other file types with a plain message", async () => {
    await expect(readDocument(file("x.docx", "x"))).rejects.toThrow("Only .pdf, .txt, .md and .csv files can be added");
  });
  it("reports a PDF with no text layer", async () => {
    pdf.numPages = 1; pdf.pages = [[]];
    await expect(readDocument(file("scan.pdf", new ArrayBuffer(8)))).rejects.toThrow("No readable text found in scan.pdf");
  });
  it("says a PDF could not be read when pdfjs fails", async () => {
    pdf.numPages = 1;
    pdf.pages = null as unknown as string[][];
    await expect(readDocument(file("bad.pdf", new ArrayBuffer(8)))).rejects.toThrow("Could not read bad.pdf");
  });
});

describe("fitDocuments", () => {
  it("accepts up to 3 files and skips the rest with a note", () => {
    const r = fitDocuments([doc("d1", "a", ["x"]), doc("d2", "b", ["x"])], [doc("", "c", ["x"]), doc("", "d", ["x"])]);
    expect(r.docs.map((d) => d.name)).toEqual(["a", "b", "c"]);
    expect(r.notes).toEqual(["Only 3 files can be added at a time, so d was skipped."]);
  });
  it("gives each new file the smallest free id", () => {
    const r = fitDocuments([doc("d2", "b", ["x"])], [doc("", "c", ["x"])]);
    expect(r.docs.map((d) => d.id)).toEqual(["d2", "d1"]);
  });
  it("takes ids from a caller-supplied generator so an id is never reused", () => {
    let n = 5;
    const r = fitDocuments([], [doc("", "c", ["x"])], () => `d${++n}`);
    expect(r.docs[0]!.id).toBe("d6");
  });
  it("truncates to about 60,000 characters in total and says how many pages were read", () => {
    const page = "y".repeat(25_000);
    const r = fitDocuments([doc("d1", "a", [page, page])], [doc("", "b", [page, page, page])]);
    const total = r.docs.flatMap((d) => d.pages).reduce((n, p) => n + p.text.length, 0);
    expect(total).toBeLessThanOrEqual(DOC_LIMITS.chars);
    expect(total).toBeGreaterThan(DOC_LIMITS.chars - 1);
    expect(r.notes).toEqual(["Only the first page of b was read."]);
    expect(r.docs[1]!.pages).toHaveLength(1);
  });
  it("skips a file when no room is left", () => {
    const r = fitDocuments([doc("d1", "a", ["z".repeat(DOC_LIMITS.chars)])], [doc("", "b", ["x"])]);
    expect(r.docs).toHaveLength(1);
    expect(r.notes).toEqual(["b was not added: the 60,000 character limit is already used."]);
  });
  it("keeps the extraction note of a long PDF", () => {
    const r = fitDocuments([], [{ ...doc("", "p.pdf", ["x"]), note: "Only the first 40 pages of p.pdf were read." }]);
    expect(r.notes).toEqual(["Only the first 40 pages of p.pdf were read."]);
  });
});
