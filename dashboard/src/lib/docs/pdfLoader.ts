import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** pdfjs-dist is a lazy chunk: it loads only when someone attaches a PDF. Its worker is a separate file Vite serves from the same origin; nothing is uploaded. */
export async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}
