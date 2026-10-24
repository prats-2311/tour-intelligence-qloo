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
    expect(screen.getAllByText("Qloo: fan hotspots").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/qloo_[a-z_]+/);
    expect(screen.getAllByText("From cache").length).toBeGreaterThan(0);
  });
  it("latest=1 keeps only the newest step, with its tool line on one clamped row", () => {
    const { container } = render(<AgentLog events={LUMEN_VALE_SAMPLE.filter((e) => e.type === "tool_call" || e.type === "tool_result").slice(0, 6)} latest={1} />);
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.textContent).toMatch(/Qloo: /);
    expect(container.querySelector("li p.font-mono")?.className).toContain("truncate");
    expect(container.textContent).not.toMatch(/qloo_[a-z_]+/);
  });
  it("exposes step status via sr-only status text per row (no double announcement)", () => {
    const { container } = render(<AgentLog events={LUMEN_VALE_SAMPLE} />);
    // Each log item should have sr-only status text before the sentence
    const logItems = container.querySelectorAll("li");
    expect(logItems.length).toBeGreaterThan(0);
    logItems.forEach((item) => {
      const srText = item.querySelector(".sr-only");
      expect(srText).toBeTruthy();
      expect(srText?.textContent).toMatch(/active|success|error|info|in progress|done|note/);
    });
    // Marker span should be aria-hidden to avoid double announcement
    const markerSpans = container.querySelectorAll("li > span[aria-hidden]");
    expect(markerSpans.length).toBeGreaterThan(0);
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
