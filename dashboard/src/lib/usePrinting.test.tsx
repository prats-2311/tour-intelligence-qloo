// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePrinting } from "./usePrinting";

afterEach(cleanup);
function Probe() { return <p>{usePrinting() ? "printing" : "screen"}</p>; }

describe("usePrinting", () => {
  it("is false on screen, true between beforeprint and afterprint", () => {
    render(<Probe />);
    expect(screen.getByText("screen")).toBeTruthy();
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    expect(screen.getByText("printing")).toBeTruthy();
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(screen.getByText("screen")).toBeTruthy();
  });
});
