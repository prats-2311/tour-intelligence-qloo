// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as client from "@/lib/qloo/client";
import type { StrategistTurn } from "@/lib/qloo/strategistReducer";
import { MessageList } from "./MessageList";
import { StrategistPanel } from "./StrategistPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ask = (t: string) => { fireEvent.change(screen.getByRole("textbox"), { target: { value: t } }); fireEvent.click(screen.getByRole("button", { name: "Send" })); };

describe("stage line while waiting", () => {
  it("shows the stage instead of the dots, politely, and updates per event", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_stage", stage: "thinking" } as const;
      yield { type: "strategist_tool_call", id: "t1", name: "get_city_playbook", args: { city: "Los Angeles", country: "US" } } as const;
      await gate;
      yield { type: "strategist_stage", stage: "writing" } as const;
      await new Promise(() => undefined);
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("hey let's talk about Los angeles");
    const line = await screen.findByText("Looking up Playbook for Los Angeles…");
    expect(line.closest("[role=status]")?.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByLabelText("Strategist is typing")).toBeNull();
    release();
    expect(await screen.findByText("Writing the answer…")).toBeTruthy();
  });
});

describe("render-time do-not-book guard", () => {
  const turn = (text: string, redactedSentences?: number): StrategistTurn => ({ question: "q", thinking: [], tools: [], status: "done", answer: { text, unsupportedNumbers: [], stoppedEarly: false, model: "m", ...(redactedSentences !== undefined ? { redactedSentences } : {}) } });
  it("hides sentences naming a listed act and shows a muted count (live)", async () => {
    vi.spyOn(client, "streamStrategist").mockImplementation(async function* () {
      yield { type: "strategist_message", text: "Local moments include Mid90s. Co-billing options are Ariel Pink, King Krule. Book early.", unsupportedNumbers: [], stoppedEarly: false, model: "m" } as const;
      yield { type: "done", summary: {} } as const;
    });
    render(<StrategistPanel context={{}} sample={false} title="t" />);
    ask("la");
    expect(await screen.findByText("Local moments include Mid90s. Book early.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Ariel Pink");
    expect(screen.getByText("1 sentence removed (do-not-book list or not a sponsor)")).toBeTruthy();
  });
  it("applies to recorded replays and adds the gateway's own count", () => {
    render(<MessageList turns={[turn("Ariel Pink opens. King Krule closes. ACLU sponsors.", 1)]} onRetry={() => undefined} busy={false} replay />);
    expect(document.body.textContent).not.toContain("Ariel Pink");
    expect(document.body.textContent).not.toContain("ACLU");
    expect(screen.getByText("King Krule closes.")).toBeTruthy();
    expect(screen.getByText("3 sentences removed (do-not-book list or not a sponsor)")).toBeTruthy();
  });
  it("shows no note on a clean answer", () => {
    render(<MessageList turns={[turn("All fine.")]} onRetry={() => undefined} busy={false} replay />);
    expect(screen.queryByText(/removed \(do-not-book/)).toBeNull();
  });
});
