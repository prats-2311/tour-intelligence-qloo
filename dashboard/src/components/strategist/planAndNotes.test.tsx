// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as client from "@/lib/qloo/client";
import { cityThread } from "@/lib/collab/types";
import { OFF, WorkspaceContext, type Workspace } from "@/lib/collab/workspaceContext";
import type { GatewayEvent } from "@/lib/qloo/types";
import { ToastProvider } from "@/components/ui/Toast";
import { StrategistPanel } from "./StrategistPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const CONTEXT = { artist: { name: "Example artist", entityId: "e1" }, cities: [{ id: "c-la", name: "Los Angeles", country: "US", verdict: "play", fanHeat: 1, activation: 1, winnability: 1 }], focusCityId: "c-la" };
const reply = (text: string): GatewayEvent[] => [{ type: "strategist_message", text, unsupportedNumbers: [], stoppedEarly: false, model: "m" }, { type: "done", summary: {} }];
function stubStrategist(text: string) {
  return vi.spyOn(client, "streamStrategist").mockImplementation(async function* () { yield* reply(text); });
}
const ws = (over: Partial<Workspace> = {}): Workspace => ({ ...OFF, enabled: true, ws: "testws12345", write: vi.fn(async () => true), ...over });
const panel = (context = CONTEXT, workspace: Workspace = OFF) => render(<ToastProvider><WorkspaceContext.Provider value={workspace}><StrategistPanel context={context} sample={false} title="t" /></WorkspaceContext.Provider></ToastProvider>);

describe("Draft a city plan", () => {
  it("is offered when a city is open, and sends a fixed one-page-plan prompt for that city", async () => {
    const spy = stubStrategist("Plan text.");
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Draft a city plan" }));
    expect(await screen.findByText("Plan text.")).toBeTruthy();
    const q = spy.mock.calls[0]![0].messages.at(-1)!.text;
    expect(q).toContain("one-page plan for Los Angeles");
    for (const part of ["sponsor pitch", "best room", "opening act", "promo zones", "timing", "risks", "Advance", "documents"]) expect(q).toContain(part);
    expect(q).toContain("cite");
  });
  it("is not offered when no city is open", () => {
    panel({ artist: CONTEXT.artist } as never);
    expect(screen.queryByRole("button", { name: "Draft a city plan" })).toBeNull();
  });
  it("renders the plan like any answer, with the attached document in the request", async () => {
    const spy = stubStrategist("Plan [doc:d1 p.1].");
    const { container } = panel();
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["Los Angeles 900 sold"], "recap.txt")] } });
    await screen.findByText("recap.txt");
    fireEvent.click(screen.getByRole("button", { name: "Draft a city plan" }));
    expect(await screen.findByText(/^Plan/)).toBeTruthy();
    expect(spy.mock.calls[0]![0].documents).toHaveLength(1);
    expect(container.querySelector("[data-doc-cite]")!.textContent).toBe("recap.txt, p. 1");
  });
});

describe("Save to team notes", () => {
  const ask = async (shows: RegExp = /Answer/) => {
    fireEvent.change(screen.getByRole("textbox", { name: "Ask a question about this tour" }), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(shows);
  };
  it("is hidden without a workspace", async () => {
    stubStrategist("Answer one.");
    panel();
    await ask();
    expect(screen.queryByRole("button", { name: "Save to team notes" })).toBeNull();
  });
  it("asks for confirmation with the visibility warning before anything is posted", async () => {
    stubStrategist("Answer one.");
    const w = ws();
    panel(CONTEXT, w);
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "Save to team notes" }));
    expect(screen.getByText("This copies the answer into notes everyone with the link can see. Document excerpts in it become visible to them.")).toBeTruthy();
    expect(w.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(w.write).not.toHaveBeenCalled();
    expect(screen.queryByText(/This copies the answer/)).toBeNull();
  });
  it("posts the answer to the current city's thread on confirm", async () => {
    stubStrategist("Answer one.");
    const w = ws();
    panel(CONTEXT, w);
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "Save to team notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
    await waitFor(() => expect(w.write).toHaveBeenCalledWith("message", { key: cityThread("c-la"), text: "Answer one." }));
    const toast = await screen.findByRole("status");
    expect(toast.textContent).toContain("Saved to team notes.");
    expect(toast.closest("[data-toast-viewport]")).not.toBeNull(); // a toast, not inline text under the answer
  });
  it("truncates to 1000 characters with an ellipsis and writes file names instead of ids", async () => {
    stubStrategist(`Austin [doc:d1 p.2] ${"x".repeat(1200)}`);
    const w = ws();
    const { container } = panel(CONTEXT, w);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["a"], "recap.txt")] } });
    await screen.findByText("recap.txt");
    await ask(/Austin/);
    fireEvent.click(screen.getByRole("button", { name: "Save to team notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
    await waitFor(() => expect(w.write).toHaveBeenCalled());
    const text = (w.write as ReturnType<typeof vi.fn>).mock.calls[0]![1].text as string;
    expect(text).toHaveLength(1000);
    expect(text.endsWith("…")).toBe(true);
    expect(text.startsWith("Austin (recap.txt, p. 2) ")).toBe(true);
    expect(text).not.toContain("[doc:");
  });
  it("shows a plain error and keeps the button when the write fails", async () => {
    stubStrategist("Answer one.");
    const w = ws({ write: vi.fn(async () => false), error: "Could not save" });
    panel(CONTEXT, w);
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "Save to team notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to notes" }));
    expect(await screen.findByText("Could not save the answer to notes. Try again.")).toBeTruthy();
  });
});
