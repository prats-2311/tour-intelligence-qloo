// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrategistPanel } from "./StrategistPanel";

const pdf = { pages: [] as string[][], numPages: 0 };
vi.mock("@/lib/docs/pdfLoader", () => ({
  loadPdfjs: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pdf.numPages,
        getPage: async (n: number) => ({ getTextContent: async () => ({ items: (pdf.pages[n - 1] ?? []).map((str) => ({ str })) }) }),
      }),
    }),
  }),
}));

const PRIVACY = "Your files stay in this tab. Their text is sent to the AI model with your questions and is not stored. Nothing is sent to Qloo.";
const answer = (text: string) => `data: ${JSON.stringify({ type: "strategist_message", text, unsupportedNumbers: [], stoppedEarly: false, model: "m" })}\n\ndata: ${JSON.stringify({ type: "done", summary: {} })}\n\n`;
const sseFetch = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(answer("Done."), { status: 200, headers: { "content-type": "text/event-stream" } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); pdf.pages = []; pdf.numPages = 0; });

const panel = () => render(<StrategistPanel context={{ artist: { name: "Example artist", entityId: "e1" } }} sample={false} title="t" />);
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const upload = (c: HTMLElement, ...files: File[]) => fireEvent.change(fileInput(c), { target: { files } });
const txt = (name: string, body = "Los Angeles drew 1,200 fans.") => new File([body], name, { type: "text/plain" });

describe("Add your documents", () => {
  it("shows the privacy copy next to the upload control", () => {
    const { container } = panel();
    expect(screen.getByText(PRIVACY)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add your documents" })).toBeTruthy();
    expect(fileInput(container).accept).toBe(".pdf,.txt,.md,.csv");
    expect(fileInput(container).multiple).toBe(true);
  });
  it("reads a PDF in the browser and shows a chip with its page count", async () => {
    pdf.numPages = 2; pdf.pages = [["Los Angeles drew 1,200"], ["Austin sold 340"]];
    const { container } = panel();
    upload(container, new File([new ArrayBuffer(4)], "recap.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("recap.pdf")).toBeTruthy();
    expect(screen.getByText("2 pages")).toBeTruthy();
  });
  it("reads text files too and shows 1 page", async () => {
    const { container } = panel();
    upload(container, txt("notes.md"));
    expect(await screen.findByText("notes.md")).toBeTruthy();
    expect(screen.getByText("1 page")).toBeTruthy();
  });
  it("accepts a file dropped on the drop zone", async () => {
    panel();
    fireEvent.drop(screen.getByTestId("doc-dropzone"), { dataTransfer: { files: [txt("dropped.csv")] } });
    expect(await screen.findByText("dropped.csv")).toBeTruthy();
  });
  it("allows at most 3 files and says which was skipped", async () => {
    const { container } = panel();
    upload(container, txt("a.txt"), txt("b.txt"), txt("c.txt"), txt("d.txt"));
    expect(await screen.findByText("c.txt")).toBeTruthy();
    expect(screen.queryByText("d.txt")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Only 3 files can be added at a time, so d.txt was skipped.");
  });
  it("reads only the first 40 pages of a long PDF and shows the note", async () => {
    pdf.numPages = 60; pdf.pages = Array.from({ length: 60 }, (_, i) => [`p${i + 1}`]);
    const { container } = panel();
    upload(container, new File([new ArrayBuffer(4)], "long.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("40 pages")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Only the first 40 pages of long.pdf were read.");
  });
  it("truncates at about 60,000 characters with a visible note", async () => {
    const { container } = panel();
    upload(container, txt("huge.txt", Array.from({ length: 2000 }, (_, i) => `row ${i} ${"z".repeat(50)}`).join("\n")));
    await screen.findByText("huge.txt");
    expect(screen.getByRole("status").textContent).toMatch(/Only the first \d+ pages of huge\.txt were read\./);
  });
  it("says plainly when a file type is not supported", async () => {
    const { container } = panel();
    upload(container, new File(["x"], "deck.pptx"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Only .pdf, .txt, .md and .csv files can be added"));
    expect(screen.queryByText("deck.pptx")).toBeNull();
  });
  it("removes a file with its Remove button", async () => {
    const { container } = panel();
    upload(container, txt("a.txt"), txt("b.txt"));
    await screen.findByText("b.txt");
    fireEvent.click(screen.getByRole("button", { name: "Remove a.txt" }));
    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.getByText("b.txt")).toBeTruthy();
  });
  it("sends the documents with the question, to the strategist endpoint only, and to no other endpoint", async () => {
    const fetchSpy = sseFetch();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = panel();
    upload(container, txt("recap.txt", "PRIVATE-FIGURE 1,200"));
    await screen.findByText("recap.txt");
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question about this tour" }), { target: { value: "What do my files say?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Done.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/qloo/strategist");
    const body = JSON.parse(String(init!.body));
    expect(body.documents).toEqual([{ id: "d1", name: "recap.txt", pages: [{ n: 1, text: "PRIVATE-FIGURE 1,200" }] }]);
    for (const [u, i] of fetchSpy.mock.calls) if (u !== "/api/qloo/strategist") expect(String(i?.body ?? "")).not.toContain("PRIVATE-FIGURE");
  });
  it("keeps document text out of the URL, storage and the message history", async () => {
    vi.stubGlobal("fetch", sseFetch());
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { container } = panel();
    upload(container, txt("recap.txt", "PRIVATE-FIGURE 1,200"));
    await screen.findByText("recap.txt");
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question about this tour" }), { target: { value: "Q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Done.");
    expect(JSON.stringify(setItem.mock.calls)).not.toContain("PRIVATE-FIGURE");
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("PRIVATE-FIGURE");
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain("PRIVATE-FIGURE");
  });
  it("loads the fictional sample with Try with a sample file", async () => {
    const fetchSpy = vi.fn(async (_u: string) => new Response("Fictional sample for this demo — not real data\nLos Angeles 1,200", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Try with a sample file" }));
    expect(await screen.findByText("example-artist-2024-tour-recap.txt")).toBeTruthy();
    expect(fetchSpy.mock.calls[0]![0]).toBe("/samples/example-artist-2024-tour-recap.txt");
  });
  it("is not offered on the scripted sample board, whose answers ignore documents", () => {
    render(<StrategistPanel context={{}} sample title="t" />);
    expect(screen.queryByRole("button", { name: "Add your documents" })).toBeNull();
  });
});
