// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { DataWarningBadge } from "./DataWarningBadge";
import { DualBars } from "./DualBars";
import { SampleBanner } from "./SampleBanner";
import { Sheet } from "./Sheet";
import { VerdictChip } from "./VerdictChip";
import { WhyThisScore } from "./WhyThisScore";

const gdl = SAMPLE_CITIES[2]!;
const bh = SAMPLE_CITIES[9]!;

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("primitives", () => {
  it.each([["play", "Play"], ["hidden_goldmine", "Hidden goldmine"], ["de_risk", "De-risk"], ["consider", "Consider"], ["skip", "Skip"], ["insufficient_data", "Not enough data"]] as const)(
    "VerdictChip %s shows label %s with an icon", (v, label) => {
      const { container } = render(<VerdictChip verdict={v} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(container.querySelector("svg")).toBeTruthy();
    });
  it("DualBars shows both values and widths", () => {
    render(<DualBars fanHeat={gdl.fanHeat} activation={gdl.activation} />);
    expect(screen.getByText("62")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect((screen.getByTestId("bar-activation") as HTMLElement).style.width).toBe("82%");
  });
  it("DualBars exposes accessible meters", () => {
    render(<DualBars fanHeat={gdl.fanHeat} activation={gdl.activation} />);
    const m = screen.getByRole("meter", { name: "Fan heat 62 of 100" });
    expect(m.getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByRole("meter", { name: "Activation 82 of 100" })).toBeTruthy();
  });
  it("DualBars renders insufficient data honestly", () => {
    render(<DualBars fanHeat={{ value: null, reason: "insufficient_data", refs: [] }} activation={gdl.activation} />);
    expect(screen.getByText("Not enough data")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Fan heat: not enough data" })).toBeTruthy();
  });
  it("WhyThisScore shows formula, weights, components, refs and integrity line", () => {
    render(<WhyThisScore city={gdl} />);
    expect(screen.getByText(/0\.5 × fan heat \+ 0\.5 × activation/)).toBeTruthy();
    expect(screen.getByText("0.84")).toBeTruthy();
    expect(screen.getByText(/Affinity signal from aggregate taste data — not a ticket forecast or a claim about individuals\./)).toBeTruthy();
  });
  it("WhyThisScore handles a city with null scores without NaN or null text", () => {
    const { container } = render(<WhyThisScore city={bh} />);
    expect(container.textContent).not.toMatch(/NaN|null|undefined/);
    expect(screen.getByText(/Affinity signal from aggregate taste data/)).toBeTruthy();
  });
  it("Sheet closes on Escape", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose} title="Why this score?"><p>body</p></Sheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
  it("Sheet is a labelled modal dialog, focuses itself, traps Tab and restores focus", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Why this score?"><button>one</button><button>two</button></Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Why this score?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const two = screen.getByText("two");
    two.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(two);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    rerender(<Sheet open={false} onClose={() => {}} title="Why this score?"><button>one</button></Sheet>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it("SampleBanner text is exact", () => {
    render(<SampleBanner />);
    expect(screen.getByText("Sample data — illustrative, not Qloo output")).toBeTruthy();
  });
  it("DataWarningBadge hidden when empty, labelled otherwise", () => {
    const { container, rerender } = render(<DataWarningBadge warnings={[]} />);
    expect(container.textContent).toBe("");
    rerender(<DataWarningBadge warnings={[{ tool: "qloo_recommend", kind: "partial", message: "3 of 4" }]} />);
    expect(screen.getByText("Partial data")).toBeTruthy();
  });
});
