import { describe, expect, it } from "vitest";
import { artistTasteArgs, cityPopularityArgs, localActRankArgs } from "../src/pipeline/recArgs.js";

describe("recommend argument builders", () => {
  it("artist-taste args carry the artist signal and the city", () => {
    expect(artistTasteArgs("brand", "ID-1", "Guadalajara, Mexico", 10)).toEqual({ target_type: "brand", signals: ["ID-1"], signal_location: "Guadalajara, Mexico", limit: 10 });
  });
  it("city-popularity args drop the artist signal", () => {
    expect(cityPopularityArgs("artist", "Guadalajara, Mexico", 5)).toEqual({ target_type: "artist", signal_location: "Guadalajara, Mexico", limit: 5 });
  });
  it("local-act rank args rank the candidate ids by taste fit with the headliner, capped at 10", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `C${i}`);
    expect(localActRankArgs("ART", "Guadalajara, Mexico", ids)).toEqual({ options: ids.slice(0, 10), option_type: "artist", signals: ["ART"], signal_location: "Guadalajara, Mexico" });
  });
});
