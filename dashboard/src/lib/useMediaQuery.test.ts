// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop, useMediaQuery } from "./useMediaQuery";

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return (next: boolean) => { mql.matches = next; listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent)); };
}

describe("useMediaQuery", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns the current match and updates on change", () => {
    const fire = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1024px)"));
    expect(result.current).toBe(false);
    act(() => fire(true));
    expect(result.current).toBe(true);
  });
  it("useIsDesktop queries min-width 1024px", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});
