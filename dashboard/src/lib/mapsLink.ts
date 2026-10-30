/** Google Maps search for a named place; the city (and country, when known) disambiguates common names. */
export const mapsSearchUrl = (name: string, city: string, country?: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${city}${country ? ", " + country : ""}`)}`;

/** Spotify search for an act by name (no artist id is stored, so a search, not a deep link). */
export const spotifySearchUrl = (name: string): string => `https://open.spotify.com/search/${encodeURIComponent(name)}`;
