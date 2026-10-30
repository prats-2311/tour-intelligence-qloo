// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_ACCENT_ORDER } from "@/lib/qloo/cityAccent";
import { LUMEN_VALE_SAMPLE, SAMPLE_BRIEF, SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { samplePlaybookEvents, sampleThisWeek } from "@/lib/qloo/fixtures/lumenValePlaybooks";
import { initialPlaybook, playbookReducer, type PlaybookState } from "@/lib/qloo/playbookReducer";
import { buildTourBook } from "@/lib/qloo/tourBook";
import { INTEGRITY_LINE } from "@/lib/qloo/labels";
import { PrintEdition } from "./PrintEdition";
import { editionLabel } from "@/lib/qloo/printEdition";

afterEach(cleanup);

const done = (id: string): PlaybookState => samplePlaybookEvents(id)!.reduce((s, event) => playbookReducer(s, { type: "event", event }), playbookReducer(initialPlaybook, { type: "start", source: "sample" }));
const ids = ["3530597", "3448439", "4005539", "3464975"];
const book = buildTourBook({
  brief: SAMPLE_BRIEF, artistName: "Lumen Vale", source: "sample", cities: SAMPLE_CITIES, shortlist: ids, accentOrder: SAMPLE_ACCENT_ORDER, boardLog: LUMEN_VALE_SAMPLE,
  playbooks: Object.fromEntries(ids.map((id) => [id, done(id)])), weeks: Object.fromEntries(ids.map((id) => [id, sampleThisWeek(id)!])),
});
const props = { book, artist: "Lumen Vale", artistId: undefined, regions: ["Latin America"], window: { start: "2027-04-12", end: "2027-06-30" }, now: new Date("2026-10-31T10:00:00Z"), recordedAt: "2026-10-28T09:00:00Z" };

describe("print edition", () => {
  it("edition label comes from the data, not a hardcoded date", () => {
    expect(editionLabel("showcase", "2026-10-28T09:00:00Z")).toBe("Recorded Qloo run, 28 Oct 2026");
    expect(editionLabel("showcase", "2025-01-03")).toBe("Recorded Qloo run, 3 Jan 2025");
    expect(editionLabel("live", null)).toBe("Live Qloo run");
    expect(editionLabel("sample", null)).toBe("Sample data, illustrative");
  });
  it("cover names the artist, scope, held markets with verdict and the honest affinity line", () => {
    render(<PrintEdition {...props} />);
    const cover = screen.getByRole("region", { name: "Cover" });
    expect(within(cover).getByRole("heading", { level: 1, name: "Lumen Vale" })).toBeTruthy();
    expect(within(cover).getByText("Advance & sponsor book")).toBeTruthy();
    expect(within(cover).getByText(/Latin America/)).toBeTruthy();
    expect(within(cover).getByText(/12 Apr 2027/)).toBeTruthy();
    expect(within(cover).getAllByRole("listitem")).toHaveLength(4);
    expect(within(cover).getByText(INTEGRITY_LINE)).toBeTruthy();
    expect(within(cover).getByText(/Prepared 31 Oct 2026/)).toBeTruthy();
  });
  it("contents lists market selection, every city, proof and appendix, in order, linked to their sections", () => {
    render(<PrintEdition {...props} />);
    const toc = screen.getByRole("navigation", { name: "Contents" });
    const items = within(toc).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("Market selection");
    for (const c of book.chapters) expect(items.some((t) => t.includes(c.city.name))).toBe(true);
    expect(items.some((t) => t.includes("Proof & method"))).toBe(true);
    expect(items.some((t) => t.includes("Appendix"))).toBe(true);
    const hrefs = within(toc).getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const h of hrefs) expect(document.querySelector(h!)).toBeTruthy();
  });
  it("lists every sponsor in each city, never a '+N more' control", () => {
    const { container } = render(<PrintEdition {...props} />);
    for (const c of book.chapters) {
      const sp = c.playbook!.cards.find((k) => k.kind === "sponsors" && k.status === "ok");
      if (!sp) continue;
      const sec = container.querySelector(`#print-${c.city.id} [data-section="sponsors"]`)!;
      for (const it of sp.items) expect(sec.textContent).toContain(String(it.name));
    }
    expect(container.textContent).not.toMatch(/\+\d+ more/);
    expect(container.textContent).not.toMatch(/Qloo · \d+ request/);
    expect(container.querySelectorAll("button, [role=button]")).toHaveLength(0);
  });
  it("each city chapter is its own page section with a key-facts grid and the suggested ask", () => {
    const { container } = render(<PrintEdition {...props} />);
    for (const c of book.chapters) {
      const ch = container.querySelector(`#print-${c.city.id}`)!;
      expect(ch.classList.contains("pe-chapter")).toBe(true);
      expect(within(ch as HTMLElement).getByRole("heading", { level: 2, name: new RegExp(c.city.name) })).toBeTruthy();
      expect(ch.querySelector('[data-facts="key"]')).toBeTruthy();
    }
  });
  it("states the suggested ask under the sponsors when a brand has fan lift", () => {
    const ch = book.chapters[2]!;
    const cards = ch.playbook!.cards.map((c) => (c.kind === "sponsors" ? { ...c, items: [{ name: "Brand A", artistRank: 2, cityRank: null }, ...c.items] } : c));
    const { container } = render(<PrintEdition {...props} book={{ ...book, chapters: [{ ...ch, playbook: { ...ch.playbook!, cards } }] }} />);
    expect(container.textContent).toMatch(/Brand A is #2 with fans and not in Guadalajara's top 20\. Suggested ask: presale access or a co-branded night at /);
  });
});
