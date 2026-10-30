// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import { liveAskSuggestions } from "@/lib/qloo/liveAskSuggestions";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, SHOWCASE, setShowcase } from "@/lib/qloo/showcase";
import { StrategistPanel } from "./StrategistPanel";

const original = SHOWCASE;
const recorded = () => parseShowcase({ ...syntheticShowcase, strategist: [{ question: "Recorded one?", events: [{ type: "strategist_message", text: "Recorded answer.", unsupportedNumbers: [], stoppedEarly: false, model: "m" }, { type: "done", summary: {} }] }] });
afterEach(() => { cleanup(); setShowcase(original); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Ask live suggestions", () => {
  it("are built from the recording's own names", () => {
    const qs = liveAskSuggestions(recorded());
    expect(qs).toHaveLength(3);
    expect(qs[0]).toMatch(/^Compare Sample Artist and .+ fans$/);
    expect(qs[1]).toMatch(/^Where in .+ are these fans concentrated\?$/);
    expect(qs[2]).toMatch(/^Rank .+ for this audience$/);
  });
  it("never name a non-sponsor organisation, even when the recording lists it first", () => {
    const raw = JSON.parse(JSON.stringify(syntheticShowcase)) as { playbooks: Record<string, Array<{ type: string; playbook?: { cards: Array<{ kind: string; status: string; items: Array<Record<string, unknown>> }> } }>> };
    for (const events of Object.values(raw.playbooks)) for (const e of events) for (const c of e.playbook?.cards ?? []) if (c.kind === "sponsors" && c.status === "ok") c.items.unshift({ name: "UNICEF", affinity: 0.99 });
    const rank = liveAskSuggestions(parseShowcase(raw)).find((q) => q.startsWith("Rank "));
    expect(rank).toBeTruthy();
    expect(rank).not.toMatch(/UNICEF/);
  });
  it("are empty for the placeholder showcase", () => {
    expect(liveAskSuggestions(parseShowcase(PLACEHOLDER_SHOWCASE))).toEqual([]);
  });
  it("show under the box and a click sends the question live, not as a recorded replay", async () => {
    setShowcase(recorded());
    const qs = liveAskSuggestions(SHOWCASE);
    const fetchSpy = vi.fn(async () => new Response(`data: ${JSON.stringify({ type: "strategist_message", text: "Live reply.", unsupportedNumbers: [], stoppedEarly: false, model: "m" })}\n\ndata: ${JSON.stringify({ type: "done", summary: {} })}\n\n`, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<StrategistPanel context={{}} sample showcase title="t" />);
    expect(screen.getByText("Ask live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: qs[1]! }));
    expect(await screen.findByText("Live reply.")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body)).messages.at(-1).text).toBe(qs[1]);
  });
});
