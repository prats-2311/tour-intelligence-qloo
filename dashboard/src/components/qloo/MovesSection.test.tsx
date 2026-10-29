// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MovesSection } from "./MovesSection";
import { parseShowcase, showcaseCities } from "@/lib/qloo/showcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import type { ComponentName, ScoredCity } from "@/lib/qloo/types";
import movesSource from "@/lib/qloo/moves.ts?raw";
import sectionSource from "./MovesSection.tsx?raw";

afterEach(cleanup);

const mk = (id: string, fan: number | null, win: number | null, components?: Partial<Record<ComponentName, number>>, extra: Partial<ScoredCity> = {}): ScoredCity => ({
  id, name: id, country: "Land", lat: 0, lon: 0,
  fanHeat: fan === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: fan, refs: [] },
  activation: { value: 50, refs: [], components },
  winnability: win === null ? { value: null, reason: "insufficient_data", refs: [] } : { value: win, refs: [] },
  verdict: "consider", zones: [], warnings: [], ...extra,
});
const board = [
  mk("Alpha", 90, 10, { sponsor_fit: 0.1 }), mk("Beta", 80, 30, { sponsor_fit: 0.3 }), mk("Gamma", 70, 60, { sponsor_fit: 0.6 }),
  mk("Delta", 60, 95, { sponsor_fit: 0.95 }), mk("Epsilon", 50, 50, { sponsor_fit: 0.5 }),
];

describe("MovesSection", () => {
  it("shows a fixed placeholder, not rows, until the board is done", () => {
    render(<MovesSection cities={board} done={false} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Where fan heat and winnability disagree" })).toBeTruthy();
    expect(screen.getByText("Ranking moves appear when the board finishes.")).toBeTruthy();
    expect(screen.queryAllByTestId("move-row")).toHaveLength(0);
  });
  it("shows the subline and the three biggest moves with ranks, delta and reason", () => {
    render(<MovesSection cities={board} done onSelect={() => {}} />);
    expect(screen.getByText("Fan heat says where the fans are. Winnability adds how winnable the city is. These cities move most between the two.")).toBeTruthy();
    const rows = screen.getAllByTestId("move-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("Alpha");
    expect(rows[0]!.textContent).toMatch(/#1 on fan heat →to #5 on winnability/);
    expect(rows[0]!.textContent).toContain("Drops on sponsor fit: 10 vs board median 50");
    expect(within(rows[0]!).getByText("down 4")).toBeTruthy();
    expect(rows[1]!.textContent).toContain("Delta");
    expect(rows[1]!.textContent).toMatch(/#4 on fan heat →to #1 on winnability/);
    expect(rows[1]!.textContent).toContain("Climbs on sponsor fit: 95 vs board median 50");
    expect(within(rows[1]!).getByText("up 3")).toBeTruthy();
  });
  it("expands to every city with both scores, movers of 0 as holds", () => {
    const four = [mk("A", 90, 10), mk("B", 70, 30), mk("C", 50, 50), mk("D", 30, 70), mk("E", 10, 90)];
    render(<MovesSection cities={four} done onSelect={() => {}} />);
    expect(screen.getAllByTestId("move-row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all moves" }));
    expect(screen.getAllByTestId("move-row")).toHaveLength(5);
    expect(screen.getByText("holds #3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });
  it("says the rankings agree when nothing moves", () => {
    render(<MovesSection cities={[mk("A", 90, 90), mk("B", 80, 80)]} done onSelect={() => {}} />);
    expect(screen.getByText("Fan heat and winnability agree on this board.")).toBeTruthy();
    expect(screen.queryAllByTestId("move-row")).toHaveLength(0);
  });
  it("leaves no blank band: the agree state reserves no list height and an empty footer row is not rendered", () => {
    const { container } = render(<MovesSection cities={[mk("A", 90, 90), mk("B", 80, 80)]} done onSelect={() => {}} />);
    expect(container.querySelector("[class*='min-h-[162px]']")).toBeNull();
    expect(container.querySelector("[class*='min-h-11']")).toBeNull();
  });
  it("hides the footer row on desktop when only the phone-only expander would be in it", () => {
    const three = [mk("A", 90, 10), mk("B", 50, 50), mk("C", 10, 90)];
    const { container } = render(<MovesSection cities={three} done onSelect={() => {}} />);
    expect(container.querySelector("[class*='min-h-11'][class*='lg:hidden']")).toBeTruthy();
  });
  it("footnotes unplaced cities and never ranks them", () => {
    const ghost = mk("Ghost", null, null, undefined, { insufficientReason: "location_unresolved" });
    render(<MovesSection cities={[...board, ghost]} done onSelect={() => {}} />);
    expect(screen.getByText("Not ranked: Ghost (Qloo couldn't place it precisely).")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all moves" }));
    expect(screen.getAllByTestId("move-row")).toHaveLength(5);
  });
  it("uses the plural footnote for two or more unplaced cities", () => {
    const g = (id: string) => mk(id, null, null, undefined, { insufficientReason: "location_unresolved" });
    render(<MovesSection cities={[...board, g("Ghost"), g("Shade")]} done onSelect={() => {}} />);
    expect(screen.getByText("Not ranked: Ghost, Shade (Qloo couldn't place them precisely).")).toBeTruthy();
  });
  it("reserves the footnote line before the board finishes", () => {
    const ghost = mk("Ghost", null, null, undefined, { insufficientReason: "location_unresolved" });
    render(<MovesSection cities={[...board, ghost]} done={false} onSelect={() => {}} />);
    expect(screen.getByTestId("moves-footnote").textContent).toBe("");
  });
  it("does not say the rankings agree when no city has both scores", () => {
    render(<MovesSection cities={[mk("A", null, null)]} done onSelect={() => {}} />);
    expect(screen.queryByText("Fan heat and winnability agree on this board.")).toBeNull();
  });
  it("reads the arrow as 'to' and renders no empty reason span for holds", () => {
    const c = { sponsor_fit: 0.5 };
    const five = [mk("A", 90, 10, c), mk("B", 70, 30, c), mk("C", 50, 50, c), mk("D", 30, 70, c), mk("E", 10, 90, c)];
    render(<MovesSection cities={five} done onSelect={() => {}} />);
    const row = screen.getAllByTestId("move-row")[0]!;
    expect(Array.from(row.querySelectorAll("span")).find((e) => e.textContent === "→")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(row).getByText("to")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all moves" }));
    const hold = screen.getAllByTestId("move-row").find((r) => r.textContent!.includes("holds #3"))!;
    expect(hold.querySelectorAll("[data-testid=move-reason]")).toHaveLength(0);
  });
  it("collapses to two rows on phones (the third is hidden below lg) and expands to all", () => {
    render(<MovesSection cities={board} done onSelect={() => {}} />);
    const rows = screen.getAllByTestId("move-row");
    expect(rows[1]!.className).not.toContain("max-lg:hidden");
    expect(rows[2]!.className).toContain("max-lg:hidden");
    fireEvent.click(screen.getByRole("button", { name: "Show all moves" }));
    expect(screen.getAllByTestId("move-row")[2]!.className).not.toContain("max-lg:hidden");
  });
  it("in the Without Qloo tab hides the rows, keeps the height and points back to Winnability", () => {
    render(<MovesSection cities={board} done paused onSelect={() => {}} />);
    expect(screen.queryAllByTestId("move-row")).toHaveLength(0);
    expect(screen.getByText("Switch to Winnability to see where fan heat and winnability disagree.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show all moves" })).toBeNull();
  });
  it("selects the tapped city", () => {
    const onSelect = vi.fn();
    render(<MovesSection cities={board} done onSelect={onSelect} />);
    fireEvent.click(screen.getAllByTestId("move-row")[0]!.querySelector("button")!);
    expect(onSelect).toHaveBeenCalledWith("Alpha");
  });
  it("renders on the synthetic showcase", () => {
    const cities = showcaseCities(parseShowcase(syntheticShowcase));
    render(<MovesSection cities={cities} done onSelect={() => {}} />);
    expect(screen.getAllByTestId("move-row").length + (screen.queryByText("Fan heat and winnability agree on this board.") ? 1 : 0)).toBeGreaterThan(0);
  });
  it("never claims winnability is better: no better, smarter, outperform or beat in the feature's text", () => {
    const re = /better|smarter|outperform|beat/i;
    expect(re.test(movesSource)).toBe(false);
    expect(re.test(sectionSource)).toBe(false);
    render(<MovesSection cities={board} done onSelect={() => {}} />);
    expect(re.test(document.body.textContent ?? "")).toBe(false);
  });
});
