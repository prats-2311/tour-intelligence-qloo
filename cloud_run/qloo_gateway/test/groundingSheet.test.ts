import { JSDOM } from "jsdom";
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

describe("sheet content (Amendment 5)", () => {
  const { html } = renderSheet(rows);
  it("prints the rating definitions verbatim per category and the prior-exposure disclosure", () => {
    for (const t of [
      "A real venue that hosts live music or performances, located in this city or its immediate metro area.",
      "A real brand that sells or operates in this city&#39;s country.".replace("&#39;", "'"),
      "A real artist based in or from this city or its metro area.",
      "A real artist from somewhere else, including famous acts that are merely popular there.",
      "no evidence the name exists as described (a venue, a brand, or a music act)",
      "evidence is unclear after a quick map and web check",
      "not fully blind to prior exposure",
    ]) expect(html).toContain(t);
    expect(html).toContain("<table>");
  });
  it("keeps the instruction numbering and highlights the focused row", () => {
    expect(html).toContain("#instructions ol{list-style:decimal");
    expect(html).toContain(".row:focus-within");
    expect(html).toContain('<ol class="rows">');
  });
});

describe("sheet behaviour in jsdom", () => {
  const boot = (storage: "ok" | "blocked" = "ok") => {
    const dom = new JSDOM(renderSheet(rows).html, {
      runScripts: "dangerously", url: "https://sheet.test/",
      beforeParse(w) {
        if (storage === "blocked") Object.defineProperty(w, "localStorage", { get() { throw new Error("blocked"); } });
      },
    });
    return dom;
  };
  const csvOf = (dom: JSDOM): Promise<string> => new Promise((res) => {
    const w = dom.window as unknown as { URL: { createObjectURL: (b: Blob) => string }; FileReader: typeof FileReader; document: Document };
    w.URL.createObjectURL = (b: Blob) => { const fr = new w.FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(b); return "blob:x"; };
    (dom.window.document.getElementById("download") as HTMLElement).click();
  });
  it("click a row, press 2: the radio is checked, storage holds it, focus moves on, and the CSV has it", async () => {
    const dom = boot();
    const doc = dom.window.document;
    const first = doc.getElementById(rows[0]!.id)!;
    (first.querySelector(".name") as HTMLElement).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    expect(doc.activeElement).toBe(first);
    doc.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "2", bubbles: true }));
    const radio = first.querySelector("input[value=other_city]") as HTMLInputElement;
    expect(radio.checked).toBe(true);
    expect(first.className).toBe("row done");
    expect(doc.activeElement).toBe(doc.getElementById(rows[1]!.id));
    const stored = JSON.parse(dom.window.localStorage.getItem(`grounding-sheet-${renderSheet(rows).hash}`)!);
    expect(stored).toEqual({ [rows[0]!.id]: "other_city" });
    expect(doc.getElementById("done")!.textContent).toBe("1");
    const csv = await csvOf(dom);
    expect(csv.split("\n")[0]).toBe("row_id,rating");
    expect(csv).toContain(`${rows[0]!.id},other_city`);
    expect(csv).toContain(`${rows[1]!.id},\n`);
    expect([...ratingsFromCsv(csv).values()].filter(Boolean)).toEqual(["other_city"]);
  });
  it("does nothing when no row has focus, and clicking a radio makes its row active", () => {
    const dom = boot();
    const doc = dom.window.document;
    doc.body.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "1", bubbles: true }));
    expect(doc.getElementById("done")!.textContent).toBe("0");
    const second = doc.getElementById(rows[1]!.id)!;
    (second.querySelector("input[value=cant_tell]") as HTMLInputElement).click();
    expect(doc.activeElement).toBe(second);
    expect(doc.getElementById("done")!.textContent).toBe("1");
  });
  it("restores saved answers on load", () => {
    const first = boot();
    first.window.localStorage.setItem(`grounding-sheet-${renderSheet(rows).hash}`, JSON.stringify({ [rows[2]!.id]: "in_city" }));
    const html = renderSheet(rows).html;
    const again = new JSDOM(html, { runScripts: "dangerously", url: "https://sheet.test/", beforeParse(w) { w.localStorage.setItem(`grounding-sheet-${renderSheet(rows).hash}`, JSON.stringify({ [rows[2]!.id]: "in_city" })); } });
    expect((again.window.document.getElementById(rows[2]!.id)!.querySelector("input[value=in_city]") as HTMLInputElement).checked).toBe(true);
    expect(again.window.document.getElementById("done")!.textContent).toBe("1");
  });
  it("shows a visible warning when storage is blocked, and only then", () => {
    const text = "Your browser is blocking storage, so download the CSV before closing this page.";
    const blocked = boot("blocked").window.document.getElementById("warn")!;
    expect(blocked.hidden).toBe(false);
    expect(blocked.textContent).toBe(text);
    expect(boot("ok").window.document.getElementById("warn")!.hidden).toBe(true);
  });
});
