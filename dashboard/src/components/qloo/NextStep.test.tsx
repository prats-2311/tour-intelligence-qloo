// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextStepButton, NextStepLink } from "./NextStep";

const loaders = vi.hoisted(() => ({ board: vi.fn(async () => ({})), book: vi.fn(async () => ({})), playbook: vi.fn(async () => ({})), landing: vi.fn(async () => ({})), proof: vi.fn(async () => ({})), insights: vi.fn(async () => ({})) }));
vi.mock("@/lib/routeImports", () => ({ routeImports: loaders }));
afterEach(() => { vi.unstubAllGlobals(); Object.values(loaders).forEach((f) => f.mockClear()); });

describe("next-step controls", () => {
  it("a link and a button each preload their route once visible, and nothing is fetched", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const cbs: IntersectionObserverCallback[] = [];
    vi.stubGlobal("IntersectionObserver", class { constructor(c: IntersectionObserverCallback) { cbs.push(c); } observe() {} disconnect() {} });
    render(<MemoryRouter><NextStepLink to="/tours/board?showcase=1">Go</NextStepLink><NextStepButton leads="/tours/book">Hold</NextStepButton></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Go" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(loaders.board).not.toHaveBeenCalled();
    cbs.forEach((cb) => cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(loaders.board).toHaveBeenCalledTimes(1);
    expect(loaders.book).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
