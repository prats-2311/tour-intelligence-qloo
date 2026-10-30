// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybookCard } from "@/lib/qloo/types";
import type { SegmentBand, SponsorSegments } from "@/lib/qloo/segments";
import { bandHeader, showsUnder21Note, signedIndex, UNDER_21_NOTE } from "@/lib/qloo/segments";
import { resetSegments, type SegmentRequest } from "@/lib/qloo/segmentStore";
import { CardBody } from "../cardBody";
import { LoadedBands } from "./SponsorSegments";

afterEach(() => { cleanup(); resetSegments(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const card = (): PlaybookCard => ({ kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Stüssy", artistRank: 1, cityRank: null }, { name: "HUF", artistRank: 2, cityRank: 4 }] }) as PlaybookCard;
const req = (country = "US"): SegmentRequest => ({ artistId: "ART-1", artist: "Mac DeMarco", city: { id: "9", name: "Los Angeles", country, lat: 34, lon: -118 } });
const band = (over: Partial<SegmentBand> = {}): SegmentBand => ({
  band: "25_to_29", phrase: "25-29", index: 0.91, status: "ok", hiddenCount: 0, newInTop5: 3, lifted: true,
  items: [{ name: "Off-white", entityId: "1", artistRank: 1, cityRank: null }, { name: "OBEY", entityId: "2", artistRank: 2, cityRank: 5 }], ...over,
});
const answer = (over: Partial<SponsorSegments> = {}): SponsorSegments => ({ status: "ok", indexes: { "25_to_29": 0.91 }, bands: [band()], ...over });
const stubFetch = (body: unknown, status = 200) => {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
};
const open = async () => { fireEvent.click(screen.getByRole("button", { name: "By age group" })); };
const body = (r: SegmentRequest = req()) => render(<CardBody card={card()} city={r.city.name} country={r.city.country} segments={r} />);

describe("sponsors by age group on the sponsors card", () => {
  it("makes no lift claim for a band with lifted:false: no city-rank caption, every row reads Fans rank it #N", async () => {
    stubFetch(answer({ bands: [band({ lifted: false, items: [{ name: "Off-white", entityId: "1", artistRank: 1, cityRank: 4 }, { name: "OBEY", entityId: "2", artistRank: 2, cityRank: 5 }] })] }));
    const { container } = body();
    await open();
    await waitFor(() => expect(screen.getByTestId("segment-band")).toBeTruthy());
    expect(container.textContent).not.toContain("City ranks are for fans of the same age group.");
    expect(screen.getByText("Fans rank it #1")).toBeTruthy();
    expect(container.textContent).not.toMatch(/city #\d/);
  });
  it("makes the city-rank claim only for a lifted band", async () => {
    stubFetch(answer());
    const { container } = body();
    await open();
    await waitFor(() => expect(screen.getByTestId("segment-band")).toBeTruthy());
    expect(container.textContent).toContain("City ranks are for fans of the same age group.");
    expect(screen.getByText("Fans #2 · city #5")).toBeTruthy();
  });
  it("does not fetch on render; the all-fans list is unchanged and the first click loads once", async () => {
    const f = stubFetch(answer());
    body();
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByText("Stüssy")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All fans" }).getAttribute("aria-pressed")).toBe("true");
    await open();
    expect(screen.getByTestId("segment-skeleton")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("segment-band")).toBeTruthy());
    expect(f).toHaveBeenCalledTimes(1);
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/qloo/sponsor-segments?");
    expect(url).toContain("artistId=ART-1");
    expect(url).toContain("city=Los+Angeles");
    fireEvent.click(screen.getByRole("button", { name: "All fans" }));
    fireEvent.click(screen.getByRole("button", { name: "25–29" }));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("shows the band control and a header with the signed index and no percent sign", async () => {
    stubFetch(answer({ indexes: { "25_to_29": 0.91, "55_and_older": 0.78 }, bands: [band(), band({ band: "55_and_older", phrase: "55-64", index: 0.78 })] }));
    const { container } = body();
    await open();
    await waitFor(() => expect(screen.getByTestId("segment-header")).toBeTruthy());
    expect(screen.getByTestId("segment-header").textContent).toBe("Fans aged 25–29 over-index here: +0.91 vs the average audience (not a share of fans).");
    expect(screen.getByRole("button", { name: "55+" })).toBeTruthy();
    expect(container.textContent).not.toContain("%");
    fireEvent.click(screen.getByRole("button", { name: "55+" }));
    expect(screen.getByTestId("segment-header").textContent).toContain("Fans aged 55+ over-index here: +0.78");
    fireEvent.click(screen.getByRole("button", { name: "All fans" }));
    expect(screen.getByText("Stüssy")).toBeTruthy();
    expect(screen.queryByTestId("segment-band")).toBeNull();
  });

  it("rows use the card's rank wording and the differ line", async () => {
    stubFetch(answer());
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-band"));
    const b = within(screen.getByTestId("segment-band"));
    expect(b.getByText("Off-white")).toBeTruthy();
    expect(b.getByText("Fans #1 · not in the city's top 20")).toBeTruthy();
    expect(b.getByText("Fans #2 · city #5")).toBeTruthy();
    expect(b.getByTestId("segment-differ").textContent).toBe("3 of the top 5 differ from all fans");
  });

  it("with no brand in the city's top 20, or no baseline, rows read 'Fans rank it #N'", async () => {
    stubFetch(answer({ bands: [band({ items: [{ name: "Off-white", entityId: "1", artistRank: 1, cityRank: null }] }), ] }));
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-band"));
    expect(screen.getByText("Fans rank it #1")).toBeTruthy();
  });

  it("a band Qloo could not break out says so", async () => {
    stubFetch(answer({ bands: [band({ status: "unavailable", items: [] })] }));
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-unavailable"));
    expect(screen.getByTestId("segment-unavailable").textContent).toBe("Qloo couldn't break this segment out.");
  });

  it("an unavailable answer says so and the control can retry", async () => {
    const f = stubFetch({ status: "unavailable", reason: "budget", message: "Session limit reached", indexes: {}, bands: [] });
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-unavailable"));
    expect(screen.getByText("Stüssy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "By age group" }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
  });

  it("a failed request is the same unavailable state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-unavailable"));
  });

  it("no skew: only All fans plus a muted line", async () => {
    stubFetch({ status: "no_skew", indexes: { "25_to_29": 0.1 }, bands: [] });
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-no-skew"));
    expect(screen.getByTestId("segment-no-skew").textContent).toBe("No age group stands out for this artist's fans.");
    const group = within(screen.getByRole("group", { name: "Age group" }));
    expect(group.getAllByRole("button").map((b) => b.textContent)).toEqual(["All fans"]);
  });

  it("applies the display filters: organisations are hidden and counted with the gateway's count", async () => {
    stubFetch(answer({ bands: [band({ hiddenCount: 1, items: [{ name: "Greenpeace", entityId: "g", artistRank: 1, cityRank: null }, { name: "Off-white", entityId: "1", artistRank: 2, cityRank: null }, { name: "Acme Foundation", entityId: "f", artistRank: 3, cityRank: null }] })] }));
    body();
    await open();
    await waitFor(() => screen.getByTestId("segment-band"));
    const b = within(screen.getByTestId("segment-band"));
    expect(b.queryByText("Greenpeace")).toBeNull();
    expect(b.queryByText("Acme Foundation")).toBeNull();
    expect(b.getByText("Off-white")).toBeTruthy();
    expect(b.getByText("3 organisations hidden (not sponsors)")).toBeTruthy();
  });

  it("shows the under-21 note for a US 18-24 band only", async () => {
    const young = band({ band: "24_and_younger", phrase: "18-24", index: 0.6 });
    stubFetch(answer({ bands: [young, band()] }));
    body(req("US"));
    await open();
    await waitFor(() => screen.getByTestId("segment-band"));
    expect(screen.getByTestId("under-21-note").textContent).toBe(UNDER_21_NOTE);
    fireEvent.click(screen.getByRole("button", { name: "25–29" }));
    expect(screen.queryByTestId("under-21-note")).toBeNull();
  });

  it("shows no under-21 note in Mexico or Brazil", async () => {
    for (const country of ["MX", "BR"]) {
      cleanup(); resetSegments();
      stubFetch(answer({ bands: [band({ band: "24_and_younger", phrase: "18-24", index: 0.6 })] }));
      body(req(country));
      await open();
      await waitFor(() => screen.getByTestId("segment-band"));
      expect(screen.queryByTestId("under-21-note")).toBeNull();
    }
  });

  it("has no control without a request (sample data)", () => {
    render(<CardBody card={card()} city="Los Angeles" country="US" />);
    expect(screen.queryByTestId("segment-control")).toBeNull();
    expect(screen.getByText("Stüssy")).toBeTruthy();
  });
});

describe("segment copy and rules", () => {
  it("under-21 note logic: US and the 18-24 band only", () => {
    expect(showsUnder21Note("US", "24_and_younger")).toBe(true);
    expect(showsUnder21Note("United States", "24_and_younger")).toBe(true);
    expect(showsUnder21Note("US", "25_to_29")).toBe(false);
    expect(showsUnder21Note("MX", "24_and_younger")).toBe(false);
    expect(showsUnder21Note("BR", "24_and_younger")).toBe(false);
    expect(showsUnder21Note(undefined, "24_and_younger")).toBe(false);
  });
  it("signed index keeps the sign and is never a percentage", () => {
    expect(signedIndex(0.91)).toBe("+0.91");
    expect(signedIndex(-0.37)).toBe("−0.37");
    expect(bandHeader("55_and_older", 0.78)).not.toContain("%");
  });
});

describe("Tour Book band lists", () => {
  it("renders every loaded band under one heading, and nothing when the answer has no bands", () => {
    render(<LoadedBands data={answer({ bands: [band(), band({ band: "55_and_older", phrase: "55-64", index: 0.78 })] })} country="US" />);
    expect(screen.getByRole("heading", { name: "Sponsors by age group" })).toBeTruthy();
    expect(screen.getAllByTestId("segment-band")).toHaveLength(2);
    cleanup();
    const { container } = render(<LoadedBands data={{ status: "no_skew", indexes: {}, bands: [] }} country="US" />);
    expect(container.innerHTML).toBe("");
  });
});
