import { describe, expect, it } from "vitest";
import { NUMBER_KEY, tiedFlags, HINT } from "./numberKey";

describe("number key", () => {
  it("explains every term the cards show, one line each", () => {
    const terms = NUMBER_KEY.map((k) => k.term);
    for (const t of ["Affinity", "Fan rank / city rank", "Venue fit", "Shared taste", "Share"]) expect(terms).toContain(t);
    expect(NUMBER_KEY.find((k) => k.term === "Shared taste")!.text).toMatch(/not a share of fans/);
    expect(HINT.affinity).toMatch(/0 to 1/);
  });
  it("flags equal scores as tied (to two decimals, as shown)", () => {
    expect(tiedFlags([0.92, 0.92, 0.92])).toEqual([true, true, true]);
    expect(tiedFlags([0.94, 0.92, 0.9])).toEqual([false, false, false]);
    expect(tiedFlags([0.921, 0.924, 0.8])).toEqual([true, true, false]);
  });
});
