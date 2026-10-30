// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as client from "@/lib/qloo/client";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, SHOWCASE, setShowcase } from "@/lib/qloo/showcase";
import type { GatewayEvent } from "@/lib/qloo/types";
import { StrategistPanel } from "./StrategistPanel";

const Q1 = "Why does Los Angeles rank above São Paulo here?";
const Q2 = "Which sponsor should I pitch first in Mexico City, and why?";
const events = (answer: string, thought: string): GatewayEvent[] => [
  { type: "strategist_thinking", summary: thought },
  { type: "strategist_tool_call", id: "a", name: "qloo_recommend", args: { target_type: "brand" } },
  { type: "strategist_tool_result", id: "a", name: "qloo_recommend", status: "ok", summary: "4 results", cached: false },
  { type: "strategist_tool_call", id: "b", name: "get_city_playbook", args: { city: "Invented" } },
  { type: "strategist_tool_result", id: "b", name: "get_city_playbook", status: "partial", summary: "2 cards", cached: false },
  { type: "strategist_message", text: answer, unsupportedNumbers: answer.includes("99") ? ["99"] : [], stoppedEarly: false, model: "m" },
  { type: "done", summary: {} },
];
const original = SHOWCASE;
const recorded = () => setShowcase(parseShowcase({ ...PLACEHOLDER_SHOWCASE, strategist: [{ question: Q1, events: events("Invented answer one.", "Invented thought one.") }, { question: Q2, events: events("Invented answer 99 two.", "Invented thought two.") }] }));
afterEach(() => { cleanup(); setShowcase(original); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Ask about this tour: showcase", () => {
  it("shows the two recorded questions as chips and a labelled live free-text box", () => {
    recorded();
    render(<StrategistPanel context={{}} sample showcase title="t" />);
    expect(screen.getByRole("button", { name: Q1 })).toBeTruthy();
    expect(screen.getByRole("button", { name: Q2 })).toBeTruthy();
    expect(screen.getByText("Ask your own question — runs live, about 30 seconds")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ask about this tour" })).toBeTruthy();
  });
  it("a typed question on the example goes to the live strategist with the board context; a recorded one never does", async () => {
    recorded();
    const fetchSpy = vi.fn(async () => new Response(`data: ${JSON.stringify({ type: "strategist_message", text: "Live one.", unsupportedNumbers: [], stoppedEarly: false, model: "m" })}\n\ndata: ${JSON.stringify({ type: "done", summary: {} })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<StrategistPanel context={{ artist: { name: "Mac DeMarco", entityId: "e1" } }} sample showcase title="t" />);
    fireEvent.click(screen.getByRole("button", { name: Q1 }));
    await screen.findByText("Invented answer one.");
    expect(fetchSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "What about Berlin?" } });
    await vi.waitFor(() => { fireEvent.click(screen.getByRole("button", { name: "Send" })); expect(fetchSpy).toHaveBeenCalledTimes(1); }, { timeout: 3000 });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/qloo/strategist");
    expect(JSON.parse(String(init.body)).context.artist.name).toBe("Mac DeMarco");
    expect(await screen.findByText("Live one.")).toBeTruthy();
  });
  it("replays a tapped question with the work log open: reasoning label, tool lines with counts, answer", async () => {
    recorded();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<StrategistPanel context={{}} sample showcase title="t" />);
    fireEvent.click(screen.getByRole("button", { name: Q1 }));
    expect(await screen.findByText("Invented answer one.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Work log" }).getAttribute("aria-expanded")).toBe("true");
    const reasoning = screen.getByRole("button", { name: "Model reasoning summary" });
    expect(reasoning.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Invented thought one.").closest("[hidden]")).toBeTruthy();
    // the answer comes before the work log
    expect(screen.getByText("Invented answer one.").compareDocumentPosition(screen.getByRole("button", { name: "Work log" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(reasoning);
    expect(reasoning.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Invented thought one.").closest("[hidden]")).toBeNull();
    expect(screen.getByText("Invented thought one.").className).toMatch(/max-h-/);
    expect(screen.getByText("Gemini's own summary of its reasoning")).toBeTruthy();
    expect(screen.getByText("Invented thought one.")).toBeTruthy();
    const tools = screen.getByRole("list", { name: "Tools used" });
    expect(within(tools).getByText("4 results")).toBeTruthy();
    expect(within(tools).getByText("2 cards")).toBeTruthy();
    expect(within(tools).getByText("ok")).toBeTruthy();
    expect(within(tools).getByText("partial")).toBeTruthy();
    expect(within(tools).getByRole("button", { name: /Qloo · recommend/ })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("shows the gateway's resultCount, singular or plural, and falls back to the summary text for old recordings", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_tool_call", id: "a", name: "qloo_recommend", args: {} } as const;
      yield { type: "strategist_tool_result", id: "a", name: "qloo_recommend", status: "ok", summary: "Found some matches for you", resultCount: 12, cached: false } as const;
      yield { type: "strategist_tool_call", id: "b", name: "get_city_playbook", args: {} } as const;
      yield { type: "strategist_tool_result", id: "b", name: "get_city_playbook", status: "ok", summary: "7 cards", resultCount: 1, cached: false } as const;
      yield { type: "strategist_tool_call", id: "c", name: "qloo_describe", args: {} } as const;
      yield { type: "strategist_tool_result", id: "c", name: "qloo_describe", status: "ok", summary: "old summary text", cached: false } as const;
      yield { type: "strategist_message", text: "A.", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const tools = await screen.findByRole("list", { name: "Tools used" });
    expect(within(tools).getByText("12 results")).toBeTruthy();
    expect(within(tools).getByText("1 card")).toBeTruthy();
    expect(within(tools).getByText("old summary text")).toBeTruthy();
    expect(within(tools).queryByText("Found some matches for you")).toBeNull();
  });
  it("the first answer's work log is open, a later one starts collapsed and can be opened; unsupported numbers stay flagged", async () => {
    recorded();
    render(<StrategistPanel context={{}} sample showcase title="t" />);
    fireEvent.click(screen.getByRole("button", { name: Q1 }));
    await screen.findByText("Invented answer one.");
    // The replay's done event lands after the answer and a chip is ignored while busy, so retry the click until the second answer shows
    // (a click while the first replay is still busy is a no-op; once the second is running further clicks are ignored too).
    await vi.waitFor(() => {
      if (!screen.queryByText("Invented answer 99 two.")) fireEvent.click(screen.getByRole("button", { name: Q2 }));
      expect(screen.getByText("Invented answer 99 two.")).toBeTruthy();
    }, { timeout: 3000 });
    const logs = screen.getAllByRole("button", { name: "Work log" });
    expect(logs.map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    fireEvent.click(logs[1]!);
    expect(logs[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("1 number not found in tool results: 99")).toBeTruthy();
  });
  it("a showcase without recorded questions keeps the existing composer", () => {
    render(<StrategistPanel context={{}} sample showcase title="t" />);
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByText(/replay the two recorded questions/)).toBeNull();
  });
});

describe("Ask about this tour: live", () => {
  it("keeps the text composer and board-aware suggestions, with the work log open by default", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () { for (const e of events("Live answer.", "Live thought.")) yield e; });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    expect(screen.queryByText(/replay the two recorded questions/)).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "q" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Live answer.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Work log" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Playbook/ })).toBeTruthy();
  });
});
