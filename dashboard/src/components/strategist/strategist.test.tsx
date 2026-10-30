// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as client from "@/lib/qloo/client";
import { SAMPLE_QUESTIONS } from "@/lib/qloo/fixtures/strategistSample";
import { StrategistPanel } from "./StrategistPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function ask(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("StrategistPanel", () => {
  it("sample mode: a suggestion chip runs the scripted turn with tool chips and reasoning", async () => {
    render(<StrategistPanel context={{}} sample title="About Lumen Vale" />);
    fireEvent.click(screen.getByRole("button", { name: SAMPLE_QUESTIONS[0]! }));
    expect(await screen.findByText(/Hidden goldmine verdict means/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Playbook/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Model reasoning summary" }));
    expect(screen.getByText("Compared fan heat with activation inputs for Guadalajara.")).toBeTruthy();
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("sample mode shows the sample questions; live mode shows board-aware ones instead", () => {
    const ctx = { cities: [{ id: "1", name: "Guadalajara", country: "MX", verdict: "hidden_goldmine", fanHeat: 62, activation: 82, winnability: 72 }] };
    const { unmount } = render(<StrategistPanel context={ctx} sample title="t" />);
    for (const q of SAMPLE_QUESTIONS) expect(screen.getByRole("button", { name: q })).toBeTruthy();
    unmount();
    render(<StrategistPanel context={ctx} sample={false} title="t" />);
    for (const q of SAMPLE_QUESTIONS) expect(screen.queryByRole("button", { name: q })).toBeNull();
    expect(screen.getByRole("button", { name: "Why is Guadalajara ranked here?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Which market is riskiest?" })).toBeTruthy();
  });
  it("flags numbers not found in tool results", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "Expect 5000 fans.", unsupportedNumbers: ["5000"], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("How many fans?");
    expect(await screen.findByText("1 number not found in tool results: 5000")).toBeTruthy();
  });
  it("pluralises the numbers note and shows the tool-limit note", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "Answer.", unsupportedNumbers: ["5000", "0.97"], stoppedEarly: true, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    expect(await screen.findByText("2 numbers not found in tool results: 5000, 0.97")).toBeTruthy();
    expect(screen.getByText("Stopped after the tool limit")).toBeTruthy();
  });
  it("Stop interrupts a streaming turn and never leaves a spinner", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* (_b, o) { await new Promise((_, rej) => o?.signal?.addEventListener("abort", () => rej(new Error("aborted")))); });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Stopped")).toBeTruthy();
    expect(screen.queryByLabelText("Strategist is typing")).toBeNull();
  });
  it("a stream that ends without done shows the connection-lost note", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_thinking", summary: "x" } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    expect(await screen.findByText("Connection lost — partial answer shown")).toBeTruthy();
  });
  it("an error shows one sentence and Retry re-asks the same question", async () => {
    const spy = vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_error", code: "UNAVAILABLE", message: "Strategist is unavailable." } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("same q");
    expect(await screen.findByText("The live strategist isn't available right now. Recorded answers still work.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0].messages.at(-1)).toEqual({ role: "user", text: "same q" });
  });
  it("a rejected tool shows as a rejected chip", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_tool_call", id: "t1", name: "qloo_capabilities", args: {} } as const;
      yield { type: "strategist_tool_result", id: "t1", name: "qloo_capabilities", status: "rejected", summary: "Tool not allowed: qloo_capabilities", cached: false } as const;
      yield { type: "strategist_message", text: "I can't use that.", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    fireEvent.click(await screen.findByRole("button", { name: /capabilities/ }));
    expect(screen.getByText("Tool not allowed: qloo_capabilities")).toBeTruthy();
  });
  it("keeps only the last 12 messages and includes prior answers", async () => {
    const spy = vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "a", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    for (let i = 0; i < 8; i++) {
      ask(`q${i}`);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(i + 1));
      await vi.waitFor(() => expect(screen.getAllByText("a")).toHaveLength(i + 1));
    }
    const msgs = spy.mock.calls[7]![0].messages;
    expect(msgs).toHaveLength(11); // <=12 and user-first
    expect(msgs.at(-1)).toEqual({ role: "user", text: "q7" });
    expect(msgs[0]!.role).toBe("user");
  });
  it("Stop mid-tool leaves no spinning chip", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* (_b, o) {
      yield { type: "strategist_tool_call", id: "t1", name: "qloo_recommend", args: {} } as const;
      await new Promise((_, rej) => o?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    });
    const { container } = render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    await screen.findByRole("button", { name: /recommend/ });
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Stopped")).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("No result")).toBeTruthy();
  });
  it("a follow-up ask right after Stop is not dropped", async () => {
    const spy = vi.spyOn(client, "streamStrategist").mockImplementation(async function* (_b, o) { await new Promise((_, rej) => o?.signal?.addEventListener("abort", () => rej(new Error("aborted")))); });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("one");
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    ask("two");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(screen.getByText("two")).toBeTruthy();
  });
  it("done without a message or error says no answer came back, with Retry", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () { yield { type: "done", summary: {} } as const; });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    expect(await screen.findByText("No answer came back — try again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

describe("strategist errors and suggestions", () => {
  it("shows plain-language copy, not the gateway's internal message", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "error", code: "HTTP_503", message: "Qloo gateway not configured" } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("q");
    expect(await screen.findByText("The live strategist isn't available right now. Recorded answers still work.")).toBeTruthy();
    expect(screen.queryByText(/gateway not configured/)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
  it("folds the suggestions away once there is an answer", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "An answer.", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{ focusCityId: "1", cities: [{ id: "1", name: "Los Angeles" }] } as never} sample={false} title="t" />);
    expect(screen.getByRole("button", { name: "Suggestions" }).getAttribute("aria-expanded")).toBe("true");
    ask("q");
    await screen.findByText("An answer.");
    expect(screen.getByRole("button", { name: "Suggestions" }).getAttribute("aria-expanded")).toBe("false");
  });
});
