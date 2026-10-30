import { describe, expect, it, vi } from "vitest";

const GlobalWorkerOptions: { workerSrc?: string } = {};
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions, getDocument: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/assets/pdf.worker.min-abc.mjs" }));

describe("loadPdfjs", () => {
  it("loads pdfjs lazily and points its worker at the bundled same-origin worker file", async () => {
    expect(GlobalWorkerOptions.workerSrc).toBeUndefined();
    const { loadPdfjs } = await import("./pdfLoader");
    const pdfjs = await loadPdfjs();
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/assets/pdf.worker.min-abc.mjs");
  });
});
