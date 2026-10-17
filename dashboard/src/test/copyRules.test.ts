import { describe, expect, it } from "vitest";

// Raw source of every component/page plus the label table; Vite resolves the globs at test time.
const raw = {
  ...import.meta.glob("../**/*.tsx", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("../lib/qloo/labels.ts", { query: "?raw", import: "default", eager: true }),
} as Record<string, string>;
const LEGACY = ["pages/Dashboard.tsx", "pages/CityDetail.tsx", "pages/NewCampaign.tsx", "pages/CompareCities.tsx", "pages/AddCities.tsx"];
const sources = Object.entries(raw)
  .map(([path, text]) => [path.replace(/^\.\.\//, ""), text] as const)
  .filter(([path]) => !/\.test\./.test(path) && !LEGACY.includes(path));

const RULES: Array<[string, RegExp]> = [
  ["AI-powered", /\bAI[- ]powered\b/i],
  ["insights as a selling word", /\binsights?\b/i],
  ["audience overlap", /audience overlap/i],
  ["percent overlap/shared", /\b\d+\s?%\s*(overlap|shared)/i],
  ["leverage", /\bleverage\b/i],
  ["unlock", /\bunlock\b/i],
  ["seamless", /\bseamless/i],
];

/** User-facing strings on one source line: string literals that read as copy, and JSX text. */
function copyOf(line: string): string[] {
  if (/^\s*(import|export .* from)\b/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return [];
  const code = line.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/ .*$/, "");
  const out: string[] = [];
  for (const m of code.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? "";
    if (/^[/@.]/.test(s) || !/\s|^[A-Z]/.test(s)) continue; // paths, ids, kebab-case tokens
    out.push(s);
  }
  for (const m of code.matchAll(/>([^<>{}]+)</g)) out.push(m[1]!);
  return out;
}

describe("copy rules (promoter language)", () => {
  it("scans the real sources", () => { expect(sources.length).toBeGreaterThan(40); expect(sources.some(([p]) => p === "pages/Landing.tsx")).toBe(true); });
  it("no banned selling words in user-facing strings", () => {
    const hits: string[] = [];
    for (const [path, text] of sources) {
      text.split("\n").forEach((line: string, i: number) => {
        for (const s of copyOf(line)) for (const [name, re] of RULES) if (re.test(s)) hits.push(`${path}:${i + 1} [${name}] ${s.trim()}`);
      });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
