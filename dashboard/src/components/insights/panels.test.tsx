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

/** F1 compare shape: shared tags carry query.score; the first three names are shown. */
const tagResults = (score: number) => ({ a: [], b: [], matchEntities: [], tags: ["dream pop", "synthwave", "shoegaze"].map((name) => ({ name, query: { score } })) });

afterEach(() => { cleanup(); resetPlaybooks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const playbookEvents = async function* (): AsyncGenerator<GatewayEvent> {
  yield { type: "playbook", playbook: { city: { name: "Guadalajara", country: "MX" }, cards: [
    { kind: "local_moment", status: "ok", refs: [], warnings: [], items: [{ name: "Bruma Nocturna", type: "urn:entity", category: "artist", affinity: 0.9 }] },
    { kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Cerro Alto Mezcal", affinity: 0.91 }] },
  ] } };
  yield { type: "done", summary: {} };
};

describe("insight panels", () => {
  it("audience profile labels the scale and states only the two strongest skews in words", () => {
    const demographics = [{ query: { age: { "24_and_younger": 0.1, "25_to_29": 0.6, "30_to_34": 0.3, "55_and_older": -0.7 }, gender: { male: -0.95, female: 0.95 } } }];
    const { container } = render(<AudienceProfile profile={{ ...P, demographics }} />);
    expect(screen.getByText("Relative to Qloo's average audience (−1 to +1)")).toBeTruthy();
    const skews = screen.getAllByTestId("demo-skew").map((li) => li.textContent);
    expect(skews).toEqual(["Skews female", "Skews 25–29"]);
    expect(container.textContent).not.toMatch(/0\.95|\+0\.|Over\/under/);
    expect(screen.getByText("dream pop")).toBeTruthy();
  });
  it("audience profile with no positive skew says so instead of listing numbers", () => {
    render(<AudienceProfile profile={{ ...P, demographics: [{ query: { gender: { male: -0.2, female: -0.1 } } }] }} />);
    expect(screen.queryAllByTestId("demo-skew")).toHaveLength(0);
    expect(screen.getByText("No clear audience skew in Qloo's data.")).toBeTruthy();
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
    rerender(<MomentumChart profile={{ ...P, trends: [] }} />);
    expect(screen.getByText("Qloo has no trend data for this artist this quarter.")).toBeTruthy();
    expect(container.querySelector("path")).toBeNull();
    rerender(<MomentumChart profile={{ ...P, trends: "garbage" as unknown as ArtistProfile["trends"] }} />);
    expect(screen.getByText("Qloo has no trend data for this artist this quarter.")).toBeTruthy();
  });
  it("promo zones with shares", () => {
    render(<PromoZones city={SAMPLE_CITIES[2]!} />);
    expect(screen.getAllByTestId("zone-row")).toHaveLength(3);
    expect(screen.getByText("38%")).toBeTruthy();
  });
  it("lists each zone name once, summing shares of per-point rows, with no duplicate keys", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const z = (label: string, share: number, affinity: number, index: number) => ({ label, lat: 0, lon: 0, affinity, index, share });
    const city = { ...SAMPLE_CITIES[2]!, zones: [z("Coyoacan", 0.3, 0.9, 0), z("Centro", 0.25, 0.8, 1), z("Coyoacan", 0.25, 0.7, 2), z("Centro", 0.2, 0.6, 3)] };
    render(<PromoZones city={city} />);
    expect(screen.getAllByTestId("zone-row")).toHaveLength(2);
    expect(screen.getByText("55%")).toBeTruthy();
    expect(screen.getByText("45%")).toBeTruthy();
    expect(err.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    err.mockRestore();
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
  it("artist compare: shared taste shown, else honest, errors visible, 1-call note", async () => {
    const spy = vi.spyOn(client, "callQlooTool")
      .mockResolvedValueOnce({ envelope: { status: "ok", results: tagResults(0.42) }, cached: true, stale: true })
      .mockResolvedValueOnce({ envelope: { data: { stuff: 1 } }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "Lumen Vale" }} source="live" />);
    expect(screen.getByText("Each comparison uses 1 Qloo call, plus 1 more if you pick a suggested name")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Bruma" } });
    fireEvent.change(screen.getByLabelText("Comparison artist 2"), { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("0.42")).toBeTruthy();
    expect(screen.getByText("shared taste · dream pop, synthwave, shoegaze")).toBeTruthy();
    expect(screen.getByText("From cache")).toBeTruthy();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(await screen.findByText("Not enough shared taste data")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("qloo_compare_audiences", { group_a: ["E"], group_b: ["Bruma"] }, expect.anything());
  });
  it.each([[tagResults(0), "0.00"], [tagResults(1), "1.00"], [{ a: [], b: [], tags: [] }, null], [{ tags: [{ name: "x", query: { score: 1.2 } }] }, null], [{ tags: [{ name: "x", query: { score: 0.1 } }] }, "0.10"]])("shared taste %j -> %s", async (results, shown) => {
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "ok", results }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText(shown ?? "Not enough shared taste data")).toBeTruthy();
  });
  const needsInput = { status: "needs_input", summary: "Choose or correct the unresolved comparison inputs.", resolution: { issues: [
    { input: "Beach", field: "group_b", candidates: [
      { id: "ID-ARTIST", name: "Beach House", type: "urn:entity:artist", description: "American dream pop duo." },
      { id: "ID-PLACE", name: "Beach House", type: "urn:entity:place", description: "Beachfront bar." },
    ] },
  ] } };
  it("artist compare: needs_input shows a picker, never 'Not enough shared taste data'; picking re-calls once with the id", async () => {
    const spy = vi.spyOn(client, "callQlooTool")
      .mockResolvedValueOnce({ envelope: needsInput, cached: false, stale: false })
      .mockResolvedValueOnce({ envelope: { status: "ok", results: tagResults(0.5) }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "ENT-1", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Beach" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Did you mean…?")).toBeTruthy();
    expect(screen.getByText("Choose or correct the unresolved comparison inputs.")).toBeTruthy();
    expect(screen.getByText("American dream pop duo.")).toBeTruthy();
    expect(screen.queryByText("Not enough shared taste data")).toBeNull();
    expect(spy).toHaveBeenCalledWith("qloo_compare_audiences", { group_a: ["ENT-1"], group_b: ["Beach"] }, expect.anything());
    const options = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Beach House"));
    expect(options).toHaveLength(2);
    expect(options[0]!.className).toContain("min-h-11");
    fireEvent.click(options[0]!);
    expect(await screen.findByText("0.50")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("qloo_compare_audiences", { group_a: ["ENT-1"], group_b: ["ID-ARTIST"] }, expect.anything());
    expect(screen.queryByText("Did you mean…?")).toBeNull();
  });
  it.each(["partial", "degraded"])("artist compare: %s envelope shows its summary, not 'Not enough shared taste data'", async (status) => {
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status, summary: `Qloo said ${status}` }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText(`Qloo said ${status}`)).toBeTruthy();
    expect(screen.queryByText("Not enough shared taste data")).toBeNull();
  });
  it("audience profile with gender-only data renders one skew and no NaN", () => {
    const { container } = render(<AudienceProfile profile={{ ...P, demographics: [{ query: { gender: { male: -0.2, female: 0.2 } } }] }} />);
    expect(screen.getAllByTestId("demo-skew")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/NaN/);
  });
  it("artist compare shows error-status envelope message", async () => {
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "error", summary: "Qloo is down" }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Qloo is down")).toBeTruthy();
    expect(screen.queryByText("Not enough shared taste data")).toBeNull();
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
    vi.spyOn(client, "callQlooTool").mockResolvedValue({ envelope: { status: "ok", results: tagResults(0.3) }, cached: false, stale: false });
    render(<ArtistCompare artist={{ entityId: "E", name: "L" }} source="live" />);
    fireEvent.change(screen.getByLabelText("Comparison artist 1"), { target: { value: "Bruma" } });
    fireEvent.change(screen.getByLabelText("Comparison artist 2"), { target: { value: "Bruma" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(screen.getAllByText("0.30")).toHaveLength(2));
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
