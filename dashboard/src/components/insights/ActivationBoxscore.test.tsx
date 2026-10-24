// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import type { ScoredCity } from "@/lib/qloo/types";
import { ActivationBoxscore } from "./ActivationBoxscore";

describe("ActivationBoxscore", () => {
  it("renders a city Qloo could not place (no activation components) without throwing", () => {
    const unplaced: ScoredCity = { ...SAMPLE_CITIES[0]!, name: "Curitiba", activation: { value: null, reason: "insufficient_data", refs: [] } };
    render(<ActivationBoxscore cities={[unplaced, SAMPLE_CITIES[1]!]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getAllByTestId("boxscore-row")).toHaveLength(2);
    expect(screen.getByText("Curitiba")).toBeTruthy();
  });
});
