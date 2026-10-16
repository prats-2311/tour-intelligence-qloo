// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TasteInsightsSkeleton, TourBoardSkeleton } from "./Skeletons";

afterEach(() => { cleanup(); });

describe("lazy-route skeletons for the Qloo screens", () => {
  it.each([["TourBoard", TourBoardSkeleton], ["TasteInsights", TasteInsightsSkeleton]] as const)("%s skeleton is aria-hidden with a fixed height", (_n, Sk) => {
    const { container } = render(<Sk />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.className).toMatch(/(^|\s)h-\[\d+px\]/);
  });
});
