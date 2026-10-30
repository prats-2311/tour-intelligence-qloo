import { describe, expect, it } from "vitest";
import { mapsSearchUrl, spotifySearchUrl } from "./mapsLink";

const M = "https://www.google.com/maps/search/?api=1&query=";
describe("mapsSearchUrl", () => {
  it("joins name, city and country and encodes spaces", () => {
    expect(mapsSearchUrl("Foro Sol", "Mexico City", "MX")).toBe(`${M}Foro%20Sol%2C%20Mexico%20City%2C%20MX`);
  });
  it("omits the country when absent", () => {
    expect(mapsSearchUrl("Foro Sol", "Mexico City")).toBe(`${M}Foro%20Sol%2C%20Mexico%20City`);
  });
  it("encodes ampersands and accents", () => {
    expect(mapsSearchUrl("Rock & Roll Hall", "Ciudad Juárez", "MX")).toBe(`${M}Rock%20%26%20Roll%20Hall%2C%20Ciudad%20Ju%C3%A1rez%2C%20MX`);
    expect(new URL(mapsSearchUrl("A&B", "C")).searchParams.get("query")).toBe("A&B, C");
  });
});
describe("spotifySearchUrl", () => {
  it("encodes spaces, ampersands and accents", () => {
    expect(spotifySearchUrl("Bruma Nocturna")).toBe("https://open.spotify.com/search/Bruma%20Nocturna");
    expect(spotifySearchUrl("Simon & Garfunkel")).toBe("https://open.spotify.com/search/Simon%20%26%20Garfunkel");
    expect(spotifySearchUrl("Stüssy")).toBe("https://open.spotify.com/search/St%C3%BCssy");
  });
});
