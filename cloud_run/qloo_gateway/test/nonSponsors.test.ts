import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NON_SPONSOR_ENDINGS, NON_SPONSOR_NAMES, dropNonSponsors, isNonSponsor, mentionsNonSponsor } from "../src/pipeline/nonSponsors.js";

describe("nonSponsors", () => {
  it("matches every listed name, case and accent folded", () => {
    for (const n of NON_SPONSOR_NAMES) { expect(isNonSponsor(n)).toBe(true); expect(isNonSponsor(`  ${n.toUpperCase()} `)).toBe(true); }
    expect(isNonSponsor("Plánned Parenthood")).toBe(true);
    expect(isNonSponsor("Planned Parenthood Federation of America")).toBe(true);
  });
  it("matches generic endings only at the end", () => {
    expect(NON_SPONSOR_ENDINGS).toEqual([" Foundation", " Party", " Church"]);
    expect(isNonSponsor("Ford Foundation")).toBe(true);
    expect(isNonSponsor("Green Party")).toBe(true);
    expect(isNonSponsor("Hillsong Church")).toBe(true);
    expect(isNonSponsor("Party City")).toBe(false);
    expect(isNonSponsor("Foundation Brewing")).toBe(false);
  });
  it("leaves real brands alone", () => {
    for (const n of ["Stüssy", "OBEY", "Kith", "HUF", "Off-White", "The Onion", "Vans", "Converse", "Synthetic Brand 01", "Unicorn Goods", "Nrad Co", "Sunrise Coffee", "Costar", "Vice", "ClickHole"]) expect(isNonSponsor(n)).toBe(false);
    expect(isNonSponsor(undefined)).toBe(false);
  });
  it("finds a listed name inside prose, not an ending", () => {
    expect(mentionsNonSponsor("For Black Lives Matter, fans rank it #7.")).toBe(true);
    expect(mentionsNonSponsor("Fans rank Vans #2.")).toBe(false);
    expect(mentionsNonSponsor("The Ford Foundation is loved.")).toBe(false);
  });
  it("drops and counts", () => {
    const r = dropNonSponsors([{ name: "ACLU" }, { name: "Vans" }, { name: "Planned Parenthood" }]);
    expect(r.items).toEqual([{ name: "Vans" }]);
    expect(r.hidden).toBe(2);
  });
  it("keeps the dashboard copy identical", () => {
    const src = readFileSync(new URL("../../../dashboard/src/lib/qloo/nonSponsors.ts", import.meta.url), "utf8");
    const grab = (name: string) => [...src.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`))![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(grab("NON_SPONSOR_NAMES")).toEqual([...NON_SPONSOR_NAMES]);
    expect(grab("NON_SPONSOR_ENDINGS")).toEqual([...NON_SPONSOR_ENDINGS]);
  });
});
