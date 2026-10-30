// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NAV_COLLAPSED_KEY, useNavCollapsed } from "./useNavCollapsed";

beforeEach(() => localStorage.clear());
afterEach(() => { document.body.innerHTML = ""; });

describe("useNavCollapsed", () => {
  it("starts expanded", () => expect(renderHook(() => useNavCollapsed(true)).result.current.collapsed).toBe(false));
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
