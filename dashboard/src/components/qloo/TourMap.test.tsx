// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";

type Handler = (e?: unknown) => void;
const maps: FakeMap[] = [];
class FakeMap {
  handlers = new Map<string, Handler[]>();
  constructor() { maps.push(this); }
  on(ev: string, h: Handler) { this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), h]); return this; }
  once(ev: string, h: Handler) { return this.on(ev, h); }
  emit(ev: string, e?: unknown) { (this.handlers.get(ev) ?? []).forEach((h) => h(e)); }
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
  it("shows an honest overlay when tiles fail and keeps the markers usable", async () => {
    const { default: TourMap } = await import("./TourMap");
    const onSelect = vi.fn();
    render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={onSelect} />);
    expect(screen.queryByText("Map tiles unavailable")).toBeNull();
    act(() => { maps[0]!.emit("error", { error: new Error("tiles 503") }); });
    expect(screen.getByText("Map tiles unavailable")).toBeTruthy();
    const marker = screen.getAllByRole("button")[0]!;
    marker.click();
    expect(onSelect).toHaveBeenCalled();
  });
  it("fits its section instead of forcing a minimum height", async () => {
    const { default: TourMap } = await import("./TourMap");
    const { container } = render(<TourMap cities={SAMPLE_CITIES.slice(0, 2)} onSelect={() => {}} />);
    expect(container.innerHTML).not.toContain("min-h-[240px]");
  });
});
