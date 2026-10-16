// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";

type Handler = (e?: unknown) => void;
const maps: FakeMap[] = [];
class FakeMap {
  handlers = new Map<string, Handler[]>();
  styleLoaded = false;
  constructor() { maps.push(this); }
  on(ev: string, h: Handler) { this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), h]); return this; }
  once(ev: string, h: Handler) { return this.on(ev, h); }
  emit(ev: string, e?: unknown) { if (ev === "style.load") this.styleLoaded = true; (this.handlers.get(ev) ?? []).forEach((h) => h(e)); }
  isStyleLoaded() { return this.styleLoaded; }
  getStyle() { return { layers: [] }; } setLayoutProperty() {} setPaintProperty() {}
  resize() {} fitBounds() {} remove() {} getSource() { return undefined; } addSource() {} addLayer() {}
}
class FakeMarker {
  opts: { element: HTMLElement };
  constructor(opts: { element: HTMLElement }) { this.opts = opts; }
  setLngLat() { return this; }
  addTo() { document.body.append(this.opts.element); return this; }
  remove() { this.opts.element.remove(); }
}
vi.mock("maplibre-gl", () => ({ default: { Map: FakeMap, Marker: FakeMarker } }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

beforeEach(() => { maps.length = 0; vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("TourMap", () => {
  it("shows an honest overlay when the style fails to load and keeps the markers usable", async () => {
    const { default: TourMap } = await import("./TourMap");
    const onSelect = vi.fn();
    render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={onSelect} />);
    expect(screen.queryByText("Map tiles unavailable")).toBeNull();
    act(() => { maps[0]!.emit("error", { error: new Error("style 503") }); });
    expect(screen.getByText("Map tiles unavailable")).toBeTruthy();
    screen.getAllByRole("button")[0]!.click();
    expect(onSelect).toHaveBeenCalled();
  });
  it("ignores a single tile error after the style has loaded", async () => {
    const { default: TourMap } = await import("./TourMap");
    render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={() => {}} />);
    act(() => { maps[0]!.emit("style.load"); maps[0]!.emit("load"); maps[0]!.emit("error", { error: new Error("tile 404"), tile: {} }); });
    expect(screen.queryByText("Map tiles unavailable")).toBeNull();
  });
  it("flags a style that never loads within 8 seconds, then clears when it loads", async () => {
    vi.useFakeTimers();
    try {
      const { default: TourMap } = await import("./TourMap");
      render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={() => {}} />);
      act(() => { vi.advanceTimersByTime(8000); });
      expect(screen.getByText("Map tiles unavailable")).toBeTruthy();
      act(() => { maps[0]!.emit("style.load"); maps[0]!.emit("load"); });
      expect(screen.queryByText("Map tiles unavailable")).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("clears the overlay on idle", async () => {
    const { default: TourMap } = await import("./TourMap");
    render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={() => {}} />);
    act(() => { maps[0]!.emit("error", { error: new Error("style 503") }); });
    act(() => { maps[0]!.emit("style.load"); maps[0]!.emit("idle"); });
    expect(screen.queryByText("Map tiles unavailable")).toBeNull();
  });
  it("fits its section instead of forcing a minimum height", async () => {
    const { default: TourMap } = await import("./TourMap");
    const { container } = render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={() => {}} />);
    expect(container.innerHTML).not.toContain("min-h-[240px]");
  });
});
