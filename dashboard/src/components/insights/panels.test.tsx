// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUMEN_VALE_SAMPLE, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import * as client from "@/lib/qloo/client";
import type { ArtistProfile, GatewayEvent } from "@/lib/qloo/types";
import { loadPlaybook, resetPlaybooks } from "@/lib/qloo/playbookStore";
import { ArtistCompare } from "./ArtistCompare";
import { AudienceProfile } from "./AudienceProfile";
import { CrossDomainTaste } from "./CrossDomainTaste";
import { MomentumChart } from "./MomentumChart";
import { PromoZones } from "./PromoZones";

const profileEvt = LUMEN_VALE_SAMPLE.find((e) => e.type === "artist_profile") as Extract<GatewayEvent, { type: "artist_profile" }>;
const { type: _t, ...profile } = profileEvt;
const P = profile as ArtistProfile;

afterEach(() => { cleanup(); resetPlaybooks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
    const { container } = render(<AudienceProfile profile={{ ...P, tags: [{ name: "odd", affinity: null }] }} />);
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
  it("cross-domain taste in sample mode reads the sample playbook, not the network", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook");
    render(<CrossDomainTaste artist={{ entityId: "sample-lumen-vale", name: "Lumen Vale" }} city={SAMPLE_CITIES[2]!} source="sample" />);
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(screen.queryByText("Live taste lookups need a live run")).toBeNull();
    expect(screen.queryByRole("button", { name: /Load taste/ })).toBeNull();
    expect(spy.mock.calls.every((c) => c[1]?.sample === true)).toBe(true);
  });
  it("cross-domain taste explains which cities have sample playbooks", () => {
    const chicago = SAMPLE_CITIES.find((c) => c.name === "Chicago")!;
    render(<CrossDomainTaste artist={{ entityId: "sample-lumen-vale", name: "Lumen Vale" }} city={chicago} source="sample" />);
    expect(screen.getByText("Sample playbooks cover Mexico City, São Paulo, Guadalajara and Curitiba")).toBeTruthy();
  });
  it("cross-domain taste labels affinities as fit", async () => {
    render(<CrossDomainTaste artist={{ entityId: "sample-lumen-vale", name: "Lumen Vale" }} city={SAMPLE_CITIES[2]!} source="sample" />);
    await screen.findByText("Bruma Nocturna");
    expect(screen.getAllByText(/\d\.\d\d fit/).length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label^="affinity 0."]')).toBeTruthy();
  });
  it("cross-domain taste reuses a loaded playbook in live mode without streaming again", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook").mockImplementation(playbookEvents);
    await loadPlaybook({ artist: "L", artistEntityId: "E", city: { id: SAMPLE_CITIES[2]!.id, name: "Guadalajara", country: "MX" }, sample: false });
    expect(spy).toHaveBeenCalledTimes(1);
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["interrupted", async function* (): AsyncGenerator<GatewayEvent> { yield { type: "tool_call", tool: "qloo_recommend", args: {}, cached: false }; }],
    ["error", async function* (): AsyncGenerator<GatewayEvent> { yield { type: "error", code: "X", message: "boom" }; }],
  ])("a %s store entry does not restart a live stream on mount", async (_n, gen) => {
    const spy = vi.spyOn(client, "streamCityPlaybook").mockImplementation(gen);
    const city = { id: SAMPLE_CITIES[2]!.id, name: "Guadalajara", country: "MX" };
    await loadPlaybook({ artist: "L", artistEntityId: "E", city, sample: false });
    expect(spy).toHaveBeenCalledTimes(1);
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    await new Promise((r) => setTimeout(r, 30));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Retry|Load taste for Guadalajara/ })).toBeTruthy();
  });
  it("a playbook finishing elsewhere while mounted shows up without a click", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(playbookEvents);
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    expect(screen.queryByText("Bruma Nocturna")).toBeNull();
    await loadPlaybook({ artist: "L", artistEntityId: "E", city: { id: SAMPLE_CITIES[2]!.id, name: "Guadalajara", country: "MX" }, sample: false });
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
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
  it("city change drops the previous city's items and waits for a click again", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(playbookEvents);
    const a = { entityId: "E", name: "L" };
    const { rerender } = render(<CrossDomainTaste artist={a} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    await screen.findByText("Bruma Nocturna");
    rerender(<CrossDomainTaste artist={a} city={SAMPLE_CITIES[0]!} source="live" />);
    expect(screen.queryByText("Bruma Nocturna")).toBeNull();
    expect(screen.getByRole("button", { name: "Load taste for Mexico City" })).toBeTruthy();
  });
  it("artist compare keys results uniquely even when the same name is compared twice", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "ok", results: [{ overlap: 0.3 }] }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Bruma" } });
    fireEvent.change(screen.getByLabelText("Comparison artist 2"), { target: { value: "Bruma" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(screen.getAllByText("30%")).toHaveLength(2));
    expect(err.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
  });
  it("cross-domain taste: a stream that ends without done/error/playbook is a lost connection with Retry", async () => {
    const spy = vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () {
      yield { type: "tool_call", tool: "qloo_recommend", args: {}, cached: false };
    });
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    expect(await screen.findByText("Connection lost — try again")).toBeTruthy();
    expect(screen.queryByText(/Qloo returned no taste data/)).toBeNull();
    spy.mockImplementation(playbookEvents);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Bruma Nocturna")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("cross-domain taste: done without a playbook keeps the honest no-data message", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(async function* () { yield { type: "done", summary: {} }; });
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    expect(await screen.findByText("Qloo returned no taste data for this city")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
  it("cross-domain taste items carry an Affinity (0–1) caption", async () => {
    vi.spyOn(client, "streamCityPlaybook").mockImplementation(playbookEvents);
    render(<CrossDomainTaste artist={{ entityId: "E", name: "L" }} city={SAMPLE_CITIES[2]!} source="live" />);
    fireEvent.click(screen.getByRole("button", { name: "Load taste for Guadalajara" }));
    await screen.findByText("Bruma Nocturna");
    expect(screen.getByText("Affinity (0–1)")).toBeTruthy();
  });
  it("audience tags label affinities as fit", () => {
    render(<AudienceProfile profile={P} />);
    expect(screen.getAllByText(/0\.94 fit/).length).toBeGreaterThan(0);
    expect(document.querySelector('[aria-label="affinity 0.94"]')).toBeTruthy();
  });
  it("audience tags carry an Affinity (0–1) caption", () => {
    render(<AudienceProfile profile={P} />);
    expect(screen.getByText("Affinity (0–1)")).toBeTruthy();
  });
});
