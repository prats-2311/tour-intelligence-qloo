// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div /> }));
vi.mock("@/lib/qloo/fixtures/lumenVale", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/qloo/fixtures/lumenVale")>();
  const cities = mod.SAMPLE_CITIES.map((c, i) => (i === 2 ? { ...c, winnability: { value: null, reason: "insufficient_data" as const, refs: [] } } : c));
  return { ...mod, SAMPLE_CITIES: cities };
});
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Landing proof card with a null winnability", () => {
  it("renders an em dash instead of 0", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByTestId("proof-winnability").textContent).toBe("—");
  });
});
