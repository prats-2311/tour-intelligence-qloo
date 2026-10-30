// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollRegion } from "./ScrollRegion";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const size = (scrollW: number, clientW: number) => {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollW);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientW);
};

describe("ScrollRegion", () => {
  it("is a focusable named region that scrolls inside itself", () => {
    size(100, 100);
    render(<ScrollRegion label="Results table"><table /></ScrollRegion>);
    const r = screen.getByRole("region", { name: "Results table, scrolls sideways" });
    expect(r.getAttribute("tabindex")).toBe("0");
    expect(r.className).toContain("overflow-x-auto");
  });
  it("shows a visible cue only when the content overflows", () => {
    size(100, 100);
    const { unmount } = render(<ScrollRegion label="A"><div /></ScrollRegion>);
    expect(screen.queryByTestId("scroll-cue")).toBeNull();
    unmount();
    size(500, 100);
    render(<ScrollRegion label="B"><div /></ScrollRegion>);
    expect(screen.getByTestId("scroll-cue").textContent).toMatch(/Scroll sideways/);
  });
});
