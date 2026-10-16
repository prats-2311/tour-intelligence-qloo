// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE } from "@/lib/qloo/fixtures/lumenVale";
import { AgentLog, AgentLogChip } from "./AgentLog";

describe("AgentLog", () => {
  it("chip shows the Qloo call count and opens", () => {
    const onOpen = vi.fn();
    render(<AgentLogChip events={LUMEN_VALE_SAMPLE} onOpen={onOpen} />);
    screen.getByRole("button", { name: /Agent · 17 Qloo calls/ }).click();
    expect(onOpen).toHaveBeenCalled();
  });
  it("chip pluralizes 'call' vs 'calls'", () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <AgentLogChip
        events={[{ type: "tool_call", tool: "qloo_describe", args: {}, cached: false }]}
        onOpen={onOpen}
      />
    );
    screen.getByRole("button", { name: /Agent · 1 Qloo call/ });
    rerender(
      <AgentLogChip
        events={[
          { type: "tool_call", tool: "qloo_describe", args: {}, cached: false },
          { type: "tool_call", tool: "qloo_trends", args: {}, cached: false },
        ]}
        onOpen={onOpen}
      />
    );
    screen.getByRole("button", { name: /Agent · 2 Qloo calls/ });
  });
  it("renders sentences, tool names and the from-cache tag", () => {
    render(<AgentLog events={LUMEN_VALE_SAMPLE} />);
    expect(screen.getByText("Finding where fans concentrate in Brazil")).toBeTruthy();
    expect(screen.getAllByText("qloo_where_popular").length).toBeGreaterThan(0);
    expect(screen.getAllByText("From cache").length).toBeGreaterThan(0);
  });
  it("exposes step status via aria-label on marker and sr-only status text", () => {
    render(<AgentLog events={LUMEN_VALE_SAMPLE} />);
    // Check for status markers with aria-labels
    const statusMarkers = screen.getAllByRole("img");
    expect(statusMarkers.length).toBeGreaterThan(0);
    // Check that each marker has an aria-label
    statusMarkers.forEach((marker) => {
      expect(marker.getAttribute("aria-label")).toMatch(/in progress|done|error|note/);
    });
    // Check for sr-only status text in the list
    const srTexts = document.querySelectorAll(".sr-only");
    expect(srTexts.length).toBeGreaterThan(0);
  });
  it("active step uses spinning LoaderCircle icon", () => {
    const events: any[] = [
      { type: "tool_call", tool: "qloo_trends", args: {}, cached: false },
    ];
    const { container } = render(<AgentLog events={events} />);
    // Check for animated SVG (LoaderCircle with animation)
    const animatedSvg = container.querySelector("svg[class*='animate']");
    expect(animatedSvg).toBeTruthy();
  });
});
