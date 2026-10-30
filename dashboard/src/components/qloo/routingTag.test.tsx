// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { CityRow } from "./CityRow";
import { BriefForm } from "./BriefForm";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CityRow Your routing tag", () => {
  const base = SAMPLE_CITIES[2]!;
  it("tags a pasted city, in the same chip style as Major market", () => {
    render(<ul><CityRow city={{ ...base, candidateSource: "your_routing" }} onOpen={() => {}} /></ul>);
    const tag = screen.getByText("Your routing");
    expect(tag.closest("[data-testid=row-notes]")).toBeTruthy();
    const major = (() => { cleanup(); render(<ul><CityRow city={{ ...base, candidateSource: "major_market" }} onOpen={() => {}} /></ul>); return screen.getByText("Major market"); })();
    expect(tag.className).toBe(major.className);
  });
  it("no tag on a heat city, and a floored pasted city carries the capped line when it is Consider", () => {
    render(<ul><CityRow city={base} onOpen={() => {}} /></ul>);
    expect(screen.queryByText("Your routing")).toBeNull();
    cleanup();
    render(<ul><CityRow city={{ ...base, verdict: "consider", candidateSource: "your_routing", fanHeatFloor: true }} onOpen={() => {}} /></ul>);
    expect(screen.getByText("Your routing")).toBeTruthy();
    expect(screen.getByTestId("row-notes").textContent).toMatch(/Capped at Consider/);
  });
});

describe("CityRow low-heat note", () => {
  const base = SAMPLE_CITIES[2]!;
  const NOTE = "Low fan heat here, by Qloo's data.";
  it("shows one honest note for a pasted floored Skip city", () => {
    render(<ul><CityRow city={{ ...base, verdict: "skip", candidateSource: "your_routing", fanHeatFloor: true }} onOpen={() => {}} /></ul>);
    expect(screen.getByTestId("row-notes").textContent).toContain(NOTE);
  });
  it("is absent for a pasted non-floored city and for a floored major-market city", () => {
    render(<ul><CityRow city={{ ...base, verdict: "skip", candidateSource: "your_routing", fanHeatFloor: false }} onOpen={() => {}} /></ul>);
    expect(screen.getByTestId("row-notes").textContent).not.toContain(NOTE);
    cleanup();
    render(<ul><CityRow city={{ ...base, verdict: "skip", candidateSource: "major_market", fanHeatFloor: true }} onOpen={() => {}} /></ul>);
    expect(screen.getByTestId("row-notes").textContent).not.toContain(NOTE);
  });
});

describe("BriefForm Paste your cities", () => {
  const fill = () => fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "Lumen Vale" } });
  const paste = (v: string) => fireEvent.change(screen.getByLabelText("Paste your cities"), { target: { value: v } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Score markets" }));

  it("has a textarea, one city per line, next to the regions", () => {
    render(<BriefForm onSubmit={() => {}} />);
    const ta = screen.getByLabelText("Paste your cities") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    expect(screen.getByText(/One city per line/)).toBeTruthy();
  });
  it("submits parsed cities (trimmed, blanks dropped, de-duplicated) in pasted mode", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    paste("  Portland, US \\n\\nAustin, US\\nportland, us\\nMexico City, MX".replace(/\\n/g, "\n"));
    submit();
    expect(onSubmit.mock.calls[0]![0].cities).toEqual([{ name: "Portland", country: "US" }, { name: "Austin", country: "US" }, { name: "Mexico City", country: "MX" }]);
  });
  it("shows the cap message and submits only the first 8", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    paste(Array.from({ length: 10 }, (_, i) => `City ${i}`).join("\n"));
    expect(screen.getByText("Up to 8 cities — the first 8 will be used.")).toBeTruthy();
    submit();
    expect(onSubmit.mock.calls[0]![0].cities).toHaveLength(8);
    expect(onSubmit.mock.calls[0]![0].cities[7].name).toBe("City 7");
  });
  it("no cap message at 8 or fewer, and no cities key when nothing is pasted", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fill();
    paste(Array.from({ length: 8 }, (_, i) => `City ${i}`).join("\n"));
    expect(screen.queryByText("Up to 8 cities — the first 8 will be used.")).toBeNull();
    paste("  \n ");
    submit();
    expect("cities" in onSubmit.mock.calls[0]![0]).toBe(false);
  });
  it("pasted cities do not need a region", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} defaultBrief={{ artist: "", regions: [], maxStops: 6 }} />);
    fill();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Pick at least one region.")).toBeTruthy();
    paste("Portland, US");
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ regions: [], cities: [{ name: "Portland", country: "US" }] });
  });
});

describe("BriefForm pasted mode regions and hint", () => {
  it("sends no default regions when cities are pasted, so a bare name can match uniquely", () => {
    const onSubmit = vi.fn();
    render(<BriefForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Artist"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Paste your cities"), { target: { value: "Tokyo\nMadrid" } });
    fireEvent.click(screen.getByRole("button", { name: "Score markets" }));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ regions: [], cities: [{ name: "Tokyo" }, { name: "Madrid" }] });
  });
  it("says exactly what a country does", () => {
    render(<BriefForm onSubmit={() => {}} />);
    expect(screen.getByText(/Add a country if a city name exists in more than one country\./)).toBeTruthy();
    expect(screen.queryByText(/regions above just help/i)).toBeNull();
  });
});


describe("CityRow long names", () => {
  it("wraps a long city name instead of truncating it", () => {
    render(<ul><CityRow city={{ ...SAMPLE_CITIES[2]!, name: "New York City" }} onOpen={() => {}} /></ul>);
    const t = screen.getByTestId("city-name-text");
    expect(t.textContent).toBe("New York City");
    expect(t.className).toContain("break-words");
    expect(t.className).toContain("max-w-full");
    expect(t.className).not.toContain("truncate");
  });
});
