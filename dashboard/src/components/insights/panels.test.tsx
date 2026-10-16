// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import * as client from "@/lib/qloo/client";
import type { ArtistProfile, GatewayEvent } from "@/lib/qloo/types";
import { ArtistCompare } from "./ArtistCompare";
import { AudienceProfile } from "./AudienceProfile";
import { CrossDomainTaste } from "./CrossDomainTaste";
import { MomentumChart } from "./MomentumChart";
import { PromoZones } from "./PromoZones";

const profileEvt = LUMEN_VALE_SAMPLE.find((e) => e.type === "artist_profile") as Extract<GatewayEvent, { type: "artist_profile" }>;
const { type: _t, ...profile } = profileEvt;
const P = profile as ArtistProfile;

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const playbookEvents = async function* (): AsyncGenerator<GatewayEvent> {
  yield { type: "playbook", playbook: { city: { name: "Guadalajara", country: "MX" }, cards: [
    { kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Bruma Nocturna", type: "urn:entity:artist", affinity: 0.9 }] },
    { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Cerro Alto Mezcal", affinity: 0.91 }] },
  ] } };
  yield { type: "done", summary: {} };
};

describe("insight panels", () => {
  it("audience bars and tags", () => {
    render(<AudienceProfile profile={P} />);
    expect(screen.getAllByTestId("demo-bar")).toHaveLength(6);
    expect(screen.getByText("dream pop")).toBeTruthy();
  });
  it("tag with null affinity renders without NaN/null", () => {
    const { container } = render(<AudienceProfile profile={{ ...P, tags: [{ name: "odd", affinity: null as unknown as number }] }} />);
    expect(screen.getByText("odd")).toBeTruthy();
    expect(container.textContent).not.toMatch(/NaN|null/);
  });
  it("momentum line or honest note", () => {
    const { container, rerender } = render(<MomentumChart profile={P} />);
    expect(container.querySelector("path")).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
    rerender(<MomentumChart profile={{ ...P, trends: null }} />);
    expect(screen.getByText("Qloo returned no trend series for this artist")).toBeTruthy();
    rerender(<MomentumChart profile={{ ...P, trends: "garbage" }} />);
    expect(screen.getByText("Qloo returned no trend series for this artist")).toBeTruthy();
  });
  it("promo zones with shares", () => {
    render(<PromoZones city={SAMPLE_CITIES[2]!} />);
    expect(screen.getAllByTestId("zone-row")).toHaveLength(3);
    expect(screen.getByText("38%")).toBeTruthy();
  });
  it("artist compare disabled in sample mode and makes no calls", () => {
    const spy = vi.spyOn(client, "callQlooTool");
    render(<ArtistCompare artist={{ entityId: "sample-lumen-vale", name: "Lumen Vale" }} source="sample" />);
    expect(screen.getByText("Live comparisons need a live run")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(spy).not.toHaveBeenCalled();
  });
  it("artist compare: finite overlap shown, else honest, errors visible, 1-call note", async () => {
    const spy = vi.spyOn(client, "callQlooTool")
      .mockResolvedValueOnce({ envelope: { status: "ok", results: [{ overlap: 0.42 }] }, cached: true, stale: true })
      .mockResolvedValueOnce({ envelope: { data: { stuff: 1 } }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "Lumen Vale" }} source="live" />);
    expect(screen.getByText("Each comparison uses 1 Qloo call")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Bruma" } });
    fireEvent.change(screen.getByLabelText("Comparison artist 2"), { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("42%")).toBeTruthy();
    expect(screen.getByText("From cache")).toBeTruthy();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(await screen.findByText("Overlap unavailable")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("qloo_compare_audiences", { group_a: ["E"], group_b: ["Bruma"] }, expect.anything());
  });
  it.each([[{ overlap: 0 }, "0%"], [{ overlap: 1 }, "100%"], [{ overlap: 1.2 }, null], [{ overlap: 50 }, null], [{ overlap: -0.1 }, null]])("overlap %j -> %s", async (results, shown) => {
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "ok", results }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText(shown ?? "Overlap unavailable")).toBeTruthy();
  });
  it("artist compare shows error-status envelope message", async () => {
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "error", summary: "Qloo is down" }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Qloo is down")).toBeTruthy();
    expect(screen.queryByText("Overlap unavailable")).toBeNull();
  });
  it("artist compare surfaces thrown errors", async () => {
    vi.spyOn(client, "callQlooTool").mockRejectedValue(new Error("Unexpected token <"));
    render(<ArtistCompare artist={{ entityId: "E", name: "Lumen Vale" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Bruma" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText(/Unexpected token/)).toBeTruthy();
  });
  it("cross-domain taste loads a city playbook", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(playbookEvents);
    render(<CrossDomainTaste artist={{ entityId: "E", name: "Lumen Vale" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(screen.getByText("Cerro Alto Mezcal")).toBeTruthy();
  });
  it("cross-domain taste disabled in sample mode, no network", () => {
    const spy = vi.spyOn(client, "streamCityPlaybook");
    render(<CrossDomainTaste artist={{ entityId: "E", name: "Lumen Vale" }} city={SAMPLE_CITIES[2]!} source="sample" />);
    expect(screen.getByText("Live taste lookups need a live run")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Load taste for Guadalajara" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(spy).not.toHaveBeenCalled();
  });
  it("error after playbook is shown", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "playbook", playbook: { city: { name: "G", country: "MX" }, cards: [] } };
      yield { type: "error", code: "X", message: "late failure" };
    });
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    expect(await screen.findByText("late failure")).toBeTruthy();
  });
  it("city change aborts previous stream and drops stale items", async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* (_q, opts) {
      signals.push(opts!.signal!);
      await new Promise((r) => setTimeout(r, 20));
      yield* playbookEvents();
    });
    const a = { entityId: "E", name: "L" };
    const { rerender } = render(<CrossDomainTaste artist={a} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    await waitFor(() => expect(signals).toHaveLength(1));
    rerender(<CrossDomainTaste artist={a} city={SAMPLE_CITIES[0]!} source="live" />);
    expect(signals[0]!.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Bruma Nocturna")).toBeNull();
    expect(screen.getByRole("button", { name: "Load taste for Mexico City" })).toBeTruthy();
  });
  it("cross-domain taste aborts the stream on unmount", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* (_q, opts) {
      signal = opts?.signal;
      await new Promise(() => {});
      yield { type: "done", summary: {} };
    });
    const { unmount } = render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    await waitFor(() => expect(signal).toBeTruthy());
    unmount();
    expect(signal!.aborted).toBe(true);
  });
});
