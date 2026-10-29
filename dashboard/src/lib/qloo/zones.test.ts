import { describe, expect, it } from "vitest";
import { zoneDisplayLabel } from "./zones";

describe("zoneDisplayLabel", () => {
  it("renames a zone that carries the city's own name, ignoring case and accents", () => {
    expect(zoneDisplayLabel("Los Angeles", "Los Angeles")).toBe("Central Los Angeles");
    expect(zoneDisplayLabel("ciudad juarez", "Ciudad Juárez")).toBe("Central Ciudad Juárez");
  });
  it("leaves other labels alone", () => {
    expect(zoneDisplayLabel("Hollywood", "Los Angeles")).toBe("Hollywood");
    expect(zoneDisplayLabel("Hollywood", undefined)).toBe("Hollywood");
  });
});
