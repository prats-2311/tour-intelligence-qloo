const KNOWN: Record<string, string> = { lilac: "#b9a3d9", bone: "#efe9dc", lagoon: "#00a0b0", vermilion: "#ff3d00", "pitch green": "#009e5c" };
// Plain colour words a model-suggested palette name usually contains ("Washed Indigo", "Faded Sand"). Modifiers are ignored.
const WORDS: Record<string, string> = {
  black: "#1c1b18", charcoal: "#36454f", grey: "#8a8a8a", gray: "#8a8a8a", silver: "#c0c0c0", white: "#f5f5f0", cream: "#f3ead3", ivory: "#f4efdc", bone: "#efe9dc",
  sand: "#d8c6a0", tan: "#c8a878", beige: "#d9c9a8", khaki: "#b5a36a", brown: "#6b4a2f", rust: "#b04a1f", terracotta: "#c26a46", clay: "#b5714f", copper: "#b87333",
  red: "#c8312b", crimson: "#a3162a", maroon: "#6d1f2f", burgundy: "#6d1f35", pink: "#e8a0b4", rose: "#d98a9a", coral: "#f0765a", orange: "#e8762b", amber: "#e0a030",
  gold: "#d4a017", mustard: "#d1a227", yellow: "#e8c933", lemon: "#f0e060", olive: "#7a7a33", sage: "#9caf88", moss: "#6b7f3c", green: "#2e8b57", emerald: "#1f9e6a", mint: "#a8e0c0",
  teal: "#1f8a8a", turquoise: "#30c0c0", aqua: "#40d0d0", cyan: "#30c0d8", blue: "#2e5fb0", cobalt: "#1f4fa8", navy: "#1f2f5a", indigo: "#3f3f8f", denim: "#4a6a9a", sky: "#7ab8e8",
  purple: "#6b3fa0", violet: "#7f4fc0", lavender: "#b8a8e0", plum: "#6b2f5a", magenta: "#c0308a", lilac: "#b9a3d9", lagoon: "#00a0b0", vermilion: "#ff3d00",
};
const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i;

/** A CSS colour for a palette name: a hex in the name, a known name, or a plain colour word inside it. Null when none (the UI then shows plain text, never an empty box). */
export function swatchFor(name: string): string | null {
  const hex = HEX.exec(name);
  if (hex) {
    const h = hex[1]!.toLowerCase();
    return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
  }
  const lower = name.trim().toLowerCase();
  if (KNOWN[lower]) return KNOWN[lower]!;
  for (const word of lower.split(/[^a-z]+/)) if (WORDS[word]) return WORDS[word]!;
  return null;
}
