// Downloads GeoNames cities5000 (CC BY 4.0) and writes a trimmed gzipped JSON.
// Usage: node scripts/build-cities.mjs
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

mkdirSync("data", { recursive: true });
execSync("curl -sSL -o /tmp/cities5000.zip https://download.geonames.org/export/dump/cities5000.zip && unzip -o -q /tmp/cities5000.zip -d /tmp");
const rows = readFileSync("/tmp/cities5000.txt", "utf8").trim().split("\n").map((line) => {
  const f = line.split("\t");
  return [f[0], f[2], f[8], Number(f[4]), Number(f[5]), Number(f[14])]; // id, asciiname, country, lat, lon, population
});
writeFileSync("data/cities5000.json.gz", gzipSync(JSON.stringify(rows)));
console.log(`wrote ${rows.length} cities`);
