// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybookCard } from "@/lib/qloo/types";
import { resetCompare } from "@/lib/qloo/compareStore";
import { resetSegments, type SegmentRequest } from "@/lib/qloo/segmentStore";
import { CardBody } from "../cardBody";

afterEach(() => { cleanup(); resetCompare(); resetSegments(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const card = (): PlaybookCard => ({ kind: "sponsors", status: "ok", refs: [], warnings: [], items: [{ name: "Stüssy", artistRank: 1, cityRank: null }, { name: "HUF", artistRank: 2, cityRank: 4 }] }) as PlaybookCard;
const req: SegmentRequest = { artistId: "ART-1", artist: "Mac DeMarco", city: { id: "9", name: "Los Angeles", country: "US", lat: 34, lon: -118 } };
const answer = (over: Record<string, unknown> = {}) => ({
  status: "ok", model: "gemini-x", prompt: "p", cached: false, note: "x",
  qlooTop: { name: "Stüssy", fanRank: 1, cityRank: null },
  brands: [{ name: "Nike", fanRank: 14, cityRank: 2 }, { name: "Coca-Cola", fanRank: 2, cityRank: 5 }, { name: "Red Bull", fanRank: null, cityRank: null }, { name: "Red Cross", fanRank: null, cityRank: null, nonSponsor: true }, { name: "Visa", fanRank: 30, cityRank: null }],
  ...over,
});
const stub = (body: unknown, status = 200) => { const f = vi.fn(async () => new Response(JSON.stringify(body), { status })); vi.stubGlobal("fetch", f); return f; };
const mount = (r: SegmentRequest | undefined = req) => render(<CardBody card={card()} city="Los Angeles" country="US" segments={r} />);
const toggle = () => screen.getByRole("button", { name: "Compare: the same model, without Qloo" });
const compareCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String((c as unknown[])[0]).includes("sponsors-without-qloo"));

describe("Compare: the same model, without Qloo", () => {
  it("is collapsed on load and makes no request until clicked", async () => {
    const f = stub(answer());
    mount();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Live: asks Gemini once, cached after.")).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
    fireEvent.click(toggle());
    expect(screen.getByTestId("compare-skeleton")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("compare-result")).toBeTruthy());
    expect(compareCalls(f)).toHaveLength(1);
    fireEvent.click(toggle()); fireEvent.click(toggle());
    expect(compareCalls(f)).toHaveLength(1); // cached in the session
  });
  it("is absent without a request (sample data)", () => {
    render(<CardBody card={card()} city="Los Angeles" country="US" />);
    expect(screen.queryByRole("button", { name: /Compare: the same model/ })).toBeNull();
  });
  it("shows Qloo's pick against Gemini's list with each position, absence and non-brands", async () => {
    stub(answer());
    mount();
    fireEvent.click(toggle());
    const res = await screen.findByTestId("compare-result");
    const qloo = within(within(res).getByTestId("compare-qloo"));
    expect(qloo.getByText("Stüssy")).toBeTruthy();
    expect(qloo.getByText("fans rank it #1 · not in the city's top 20")).toBeTruthy();
    const gem = within(within(res).getByTestId("compare-gemini"));
    expect(gem.getByText("Nike").closest("li")!.textContent).toContain("#14 with these fans");
    expect(gem.getByText("Red Bull").closest("li")!.textContent).toContain("not in these fans' top 20");
    expect(gem.getByText("Red Cross").closest("li")!.textContent).toContain("not a brand");
    expect(gem.getAllByRole("listitem")).toHaveLength(5);
  });
  it("computes the summary, shows the honesty note verbatim, and never a percent sign", async () => {
    stub(answer());
    const { container } = mount();
    fireEvent.click(toggle());
    await screen.findByTestId("compare-result");
    // ranked: 14, 2, 30 -> average 15.3 ; unranked brands: Red Bull only (Red Cross is not a brand): 1 of 4
    expect(screen.getByTestId("compare-summary").textContent).toBe("Gemini's picks average #15.3 with these fans; 1 of 4 aren't in their top 20.");
    expect(screen.getByTestId("compare-note").textContent).toBe("Measured on Qloo's own fan ranking: this shows how far a model's memory strays from these fans' taste, not that the ranking is right.");
    expect(container.textContent).not.toContain("%");
  });
  it("shows an unavailable state with no summary", async () => {
    stub({ status: "unavailable", reason: "capped", message: "Comparison limit reached" });
    mount();
    fireEvent.click(toggle());
    expect(await screen.findByTestId("compare-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("compare-summary")).toBeNull();
  });
  it("on a timeout offers Try again, which asks once more", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 504 })).mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));
    vi.stubGlobal("fetch", f);
    mount();
    fireEvent.click(toggle());
    const alert = await screen.findByTestId("compare-timeout");
    expect(alert.textContent).toContain("This took too long. Try again.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByTestId("compare-result");
    expect(compareCalls(f)).toHaveLength(2);
  });
});
