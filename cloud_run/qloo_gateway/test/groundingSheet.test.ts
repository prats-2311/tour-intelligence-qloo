import { describe, expect, it } from "vitest";
import { buildRows, type GroundItem } from "../src/backtest/grounding.js";
import { ratingsFromCsv, renderSheet, ratingsTemplateCsv, RATING_CODES, RATING_LABELS } from "../src/backtest/groundingSheet.js";

const base = { cityId: "7", city: "Testville", country: "MX" };
const items: GroundItem[] = [
  { ...base, category: "venue", arm: "qloo", name: "Hall One", rank: 1 },
  { ...base, category: "venue", arm: "llm", name: "Hall One", rank: 1 },
  { ...base, category: "brand", arm: "qloo", name: "Brand & Co <x>", rank: 1 },
  { ...base, category: "local_act", arm: "llm", name: "The \"Quote\" Band", rank: 1 },
];
const rows = buildRows(items);

describe("renderSheet", () => {
  const { html, hash } = renderSheet(rows);
  it("is self-contained: no external scripts, styles or images", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<img/i);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
  it("shows one row per name with id, city, country, category label and the two free links", () => {
    for (const r of rows) {
      expect(html).toContain(`id="${r.id}"`);
    }
    expect(html).toContain("Venue");
    expect(html).toContain("Brand");
    expect(html).toContain("Local act");
    const q = encodeURIComponent("Hall One Testville");
    expect(html).toContain(`https://www.google.com/maps/search/?api=1&amp;query=${q}`);
    expect(html).toContain(`https://duckduckgo.com/?q=${q}`);
    expect(html).toContain(">Map<");
    expect(html).toContain(">Search<");
  });
  it("escapes names", () => {
    expect(html).toContain("Brand &amp; Co &lt;x&gt;");
    expect(html).not.toContain("<x>");
    expect(html).toContain("The &quot;Quote&quot; Band");
  });
  it("offers exactly four choices with the protocol's labels, 1 to 4 keys, a counter and a CSV download", () => {
    expect(RATING_LABELS).toEqual(["Exists, in this city", "Exists, in another city", "Doesn't exist", "Can't tell"]);
    expect(RATING_CODES).toEqual(["in_city", "other_city", "not_exist", "cant_tell"]);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(rows.length * 4);
    for (const l of ["Exists, in this city", "Exists, in another city", "Doesn&#39;t exist", "Can&#39;t tell"]) expect(html).toContain(l);
    expect(html).toContain("of " + rows.length + " rated");
    expect(html).toContain("Download CSV");
    expect(html).toContain("row_id,rating");
    expect(html).toContain("localStorage");
    expect(html).toContain(hash);
  });
  it("is blinded: no source, rank or arm vocabulary anywhere, including attributes, comments and script", () => {
    const lower = html.toLowerCase();
    for (const banned of ["qloo", "gemini", "llm", "arm", "rank", "source"]) expect(lower).not.toContain(banned);
    expect(html).not.toMatch(/<!--/);
  });
  it("the instructions say roughly 20 minutes in plain words", () => {
    expect(html).toMatch(/20 minutes/);
  });
  it("is deterministic", () => {
    expect(renderSheet(rows).html).toBe(html);
    expect(renderSheet([...rows].reverse()).hash).toBe(hash);
  });
});

describe("ratings CSV", () => {
  it("the template lists every row id with an empty rating", () => {
    const csv = ratingsTemplateCsv(rows);
    expect(csv.split("\n")[0]).toBe("row_id,rating");
    expect(csv.trim().split("\n").slice(1)).toEqual(rows.map((r) => `${r.id},`));
  });
  it("round-trips a downloaded file, with blank ratings kept as unrated, CRLF and quotes tolerated", () => {
    const csv = `row_id,rating\r\n${rows[0]!.id},in_city\r\n"${rows[1]!.id}","not_exist"\r\n${rows[2]!.id},\r\n`;
    const parsed = ratingsFromCsv(csv);
    expect(parsed.get(rows[0]!.id)).toBe("in_city");
    expect(parsed.get(rows[1]!.id)).toBe("not_exist");
    expect(parsed.get(rows[2]!.id)).toBeNull();
  });
  it("rejects an unknown rating code or a bad header", () => {
    expect(() => ratingsFromCsv("row_id,rating\nr001,maybe\n")).toThrow(/maybe/);
    expect(() => ratingsFromCsv("id,score\nr001,in_city\n")).toThrow(/header/);
  });
});
