// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlaybookCard } from "@/lib/qloo/types";
import { heroWhys } from "../heroWhy";
import { VenueFit } from "./VenueFit";

afterEach(cleanup);
const card = (scores: number[]): PlaybookCard => ({ kind: "venue_fit", status: "ok", items: scores.map((a, i) => ({ name: `Room ${i}`, affinity: a })), refs: [], warnings: [] } as unknown as PlaybookCard);

describe("venue ties", () => {
  it("shows 'tied' beside equal scores and gives the score a description", () => {
    render(<VenueFit card={card([0.92, 0.92, 0.92])} city="Mexico City" />);
    expect(screen.getAllByText("tied")).toHaveLength(3);
    expect(screen.getAllByTitle(/Venue fit, 0 to 1/).length).toBeGreaterThan(0);
  });
  it("shows no tag when scores differ", () => {
    render(<VenueFit card={card([0.94, 0.9])} city="Mexico City" />);
    expect(screen.queryByText("tied")).toBeNull();
  });
  it("the hero tile says tied for the top room", () => {
    expect(heroWhys([card([0.92, 0.92, 0.9])]).best_room?.text).toBe("venue fit 0.92, tied #1 of 3 rooms");
  });
});
