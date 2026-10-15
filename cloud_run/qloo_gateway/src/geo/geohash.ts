const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function decodeGeohash(hash: string): { lat: number; lon: number } {
  let latLo = -90, latHi = 90, lonLo = -180, lonHi = 180, even = true;
  for (const ch of hash.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`invalid geohash character: ${ch}`);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const on = (idx >> bit) & 1;
      if (even) { const mid = (lonLo + lonHi) / 2; if (on) lonLo = mid; else lonHi = mid; }
      else { const mid = (latLo + latHi) / 2; if (on) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { lat: (latLo + latHi) / 2, lon: (lonLo + lonHi) / 2 };
}
