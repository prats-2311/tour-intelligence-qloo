import { describe, expect, it } from "vitest";
import { artistTasteArgs, cityPopularityArgs } from "../src/pipeline/recArgs.js";

describe("recommend argument builders", () => {
  it("artist-taste args carry the artist signal and the city", () => {
    expect(artistTasteArgs("brand", "ID-1", "Guadalajara, Mexico", 10)).toEqual({ target_type: "brand", signals: ["ID-1"], signal_location: "Guadalajara, Mexico", limit: 10 });
  });
  it("city-popularity args drop the artist signal", () => {
    expect(cityPopularityArgs("artist", "Guadalajara, Mexico", 5)).toEqual({ target_type: "artist", signal_location: "Guadalajara, Mexico", limit: 5 });
  });
});
