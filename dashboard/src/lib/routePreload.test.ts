// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeKey, usePreloadWhenVisible } from "./routePreload";

const loaders = vi.hoisted(() => ({ board: vi.fn(async () => ({})), book: vi.fn(async () => ({})), playbook: vi.fn(async () => ({})), landing: vi.fn(async () => ({})), proof: vi.fn(async () => ({})), insights: vi.fn(async () => ({})) }));
vi.mock("./routeImports", () => ({ routeImports: loaders }));

afterEach(() => { vi.unstubAllGlobals(); Object.values(loaders).forEach((f) => f.mockClear()); });

describe("routeKey", () => {
  it("maps a path (query ignored) to its lazy route", () => {
    expect(routeKey("/")).toBe("landing");
    expect(routeKey("/tours/board?showcase=1")).toBe("board");
    expect(routeKey("/tours/budget?showcase=1&ws=abc")).toBe("budget");
    expect(routeKey("/tours/playbook/abc?sample=1")).toBe("playbook");
    expect(routeKey("/tours/book")).toBe("book");
    expect(routeKey("/proof")).toBe("proof");
    expect(routeKey("/insights")).toBe("insights");
    expect(routeKey("/nowhere")).toBeNull();
  });
});

describe("usePreloadWhenVisible", () => {
  it("loads the next route's chunk once its control becomes visible, never before", () => {
    let cb: IntersectionObserverCallback = () => {};
    const observe = vi.fn();
    vi.stubGlobal("IntersectionObserver", class { constructor(c: IntersectionObserverCallback) { cb = c; } observe = observe; disconnect() {} });
    const { result } = renderHook(() => usePreloadWhenVisible("/tours/book?showcase=1"));
    result.current(document.createElement("a"));
    expect(observe).toHaveBeenCalled();
    expect(loaders.book).not.toHaveBeenCalled();
    cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(loaders.book).not.toHaveBeenCalled();
    cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(loaders.book).toHaveBeenCalledTimes(1);
  });
  it("preloads at once when IntersectionObserver is missing, and ignores a null target", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => usePreloadWhenVisible("/tours/board"));
    result.current(document.createElement("a"));
    expect(loaders.board).toHaveBeenCalledTimes(1);
    const none = renderHook(() => usePreloadWhenVisible(null));
    none.result.current(document.createElement("a"));
    expect(loaders.board).toHaveBeenCalledTimes(1);
  });
  it("makes no network request", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    vi.stubGlobal("IntersectionObserver", undefined);
    renderHook(() => usePreloadWhenVisible("/tours/book")).result.current(document.createElement("a"));
    expect(f).not.toHaveBeenCalled();
  });
});
