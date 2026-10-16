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
  it("renders sentences, tool names and the from-cache tag", () => {
    render(<AgentLog events={LUMEN_VALE_SAMPLE} />);
    expect(screen.getByText("Finding where fans concentrate in Brazil")).toBeTruthy();
    expect(screen.getAllByText("qloo_where_popular").length).toBeGreaterThan(0);
    expect(screen.getAllByText("From cache").length).toBeGreaterThan(0);
  });
});
