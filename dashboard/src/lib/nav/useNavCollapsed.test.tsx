// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_COLLAPSED_KEY, useNavCollapsed } from "./useNavCollapsed";

let wide = true;
beforeEach(() => {
  localStorage.clear();
  wide = true;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("1440") ? wide : true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("useNavCollapsed", () => {
  it("with nothing stored it starts collapsed below 1440px so the board keeps its width", () => {
    wide = false;
    expect(renderHook(() => useNavCollapsed(true)).result.current.collapsed).toBe(true);
  });
  it("a stored choice beats the width default", () => {
    wide = false;
    localStorage.setItem("tiq.nav.collapsed", "0");
    expect(renderHook(() => useNavCollapsed(true)).result.current.collapsed).toBe(false);
  });
  it("starts expanded on a wide screen", () => expect(renderHook(() => useNavCollapsed(true)).result.current.collapsed).toBe(false));
  it("toggle collapses and persists under tiq.nav.collapsed", () => {
    const { result } = renderHook(() => useNavCollapsed(true));
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(NAV_COLLAPSED_KEY).toBe("tiq.nav.collapsed");
    expect(localStorage.getItem("tiq.nav.collapsed")).toBe("1");
    act(() => result.current.toggle());
    expect(localStorage.getItem("tiq.nav.collapsed")).toBe("0");
  });
  it("restores the stored state", () => {
    localStorage.setItem("tiq.nav.collapsed", "1");
    expect(renderHook(() => useNavCollapsed(true)).result.current.collapsed).toBe(true);
  });
  it("the [ key toggles", () => {
    const { result } = renderHook(() => useNavCollapsed(true));
    fireEvent.keyDown(document, { key: "[" });
    expect(result.current.collapsed).toBe(true);
    fireEvent.keyDown(document, { key: "[" });
    expect(result.current.collapsed).toBe(false);
  });
  it("ignores [ while typing, with a modifier, or when the sidebar is not shown", () => {
    const { result } = renderHook(() => useNavCollapsed(true));
    const input = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(input, { key: "[" });
    fireEvent.keyDown(document, { key: "[", metaKey: true });
    fireEvent.keyDown(document, { key: "[", ctrlKey: true });
    expect(result.current.collapsed).toBe(false);
    const off = renderHook(() => useNavCollapsed(false));
    fireEvent.keyDown(document, { key: "[" });
    expect(off.result.current.collapsed).toBe(false);
  });
  it("works when localStorage throws", () => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    Storage.prototype.setItem = () => { throw new Error("blocked"); };
    try {
      const { result } = renderHook(() => useNavCollapsed(true));
      expect(result.current.collapsed).toBe(false);
      act(() => result.current.toggle());
      expect(result.current.collapsed).toBe(true);
    } finally { Storage.prototype.getItem = get; Storage.prototype.setItem = set; }
  });
});
