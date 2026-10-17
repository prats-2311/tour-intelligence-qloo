// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "@/lib/qloo/cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { SAMPLE_TEXT } from "@/lib/qloo/labels";
import { showcaseBannerText } from "@/lib/qloo/showcase";
import { buildTourBook } from "@/lib/qloo/tourBook";
import { BookCover } from "./BookCover";

afterEach(cleanup);

const ids = ["3530597", "3448439", "4005539"];
const book = buildTourBook({
  brief: SAMPLE_BRIEF, artistName: "Lumen Vale", source: "sample", cities: SAMPLE_CITIES, shortlist: ids, accentOrder: SAMPLE_ACCENT_ORDER, boardLog: LUMEN_VALE_SAMPLE, playbooks: {}, weeks: {},
});

describe("BookCover as the advance and sponsor-pitch document", () => {
  it("shows the label, artist, regions and season, the markets-held line and the tagline", () => {
    render(<BookCover artist="Lumen Vale" regions={["Latin America", "Europe"]} season="Autumn 2027" chapters={book.chapters} sample={false} />);
    expect(screen.getByText("Advance & sponsor pitch")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Lumen Vale" })).toBeTruthy();
    expect(screen.getByText("Latin America, Europe · Autumn 2027")).toBeTruthy();
    expect(screen.getByText("3 markets held — why each one, and how to win it")).toBeTruthy();
    expect(screen.getByText("Don't just find your fans. Win their city.")).toBeTruthy();
    expect(screen.queryByText(SAMPLE_TEXT)).toBeNull();
  });
  it("keeps the sample banner in sample and showcase mode", () => {
    const { rerender } = render(<BookCover artist="A" regions={["X"]} season="S" chapters={book.chapters} sample />);
    expect(screen.getByText(SAMPLE_TEXT)).toBeTruthy();
    rerender(<BookCover artist="A" regions={["X"]} season="S" chapters={book.chapters} sample showcase />);
    expect(screen.getByText(showcaseBannerText())).toBeTruthy();
  });
  it("says one market for a single chapter", () => {
    render(<BookCover artist="A" regions={["X"]} season="S" chapters={book.chapters.slice(0, 1)} sample={false} />);
    expect(screen.getByText("1 market held — why it, and how to win it")).toBeTruthy();
  });
});
