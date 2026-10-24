import { describe, expect, it } from "vitest";
import { cityCode, coBillLine, fit, liftLine, metaLine, pct, removalText } from "./format";

describe("playbook format", () => {
  it("formats fits, shares and lift", () => {
    expect(fit(0.91)).toBe("0.91"); expect(fit(Number.NaN)).toBe("—"); expect(fit(null)).toBe("—");
    expect(pct(0.38)).toBe("38%");
    expect(liftLine(0.34, 0.88, 0.2992)).toBe("0.34 × 0.88 = 0.30");
  });
  it("coBillLine says it in plain words", () => {
    expect(coBillLine(0.34, 0.88)).toBe("Fans share taste 34% · the city likes them 88%");
  });
  it("builds the mono meta line from the city code and item count", () => {
    expect(metaLine("GDL", "sponsors", { kind: "sponsors", status: "ok", items: new Array(10).fill({}), refs: [], warnings: [] })).toBe("GDL · SPONSORS · 10 BRANDS");
    expect(metaLine("GDL", "promo_zones")).toBe("GDL · PROMO ZONES");
  });
  it("explains each removal reason in plain language", () => {
    expect(removalText({ reason: "unsupported_number", detail: "0.93" })).toBe("Number 0.93 not in evidence");
    expect(removalText({ reason: "unsupported_entity", detail: "Foro Alameda" })).toBe("Entity 'Foro Alameda' not in any referenced result");
    expect(removalText({ reason: "dangling_ref", detail: "sponsors:9" })).toBe("Cites missing evidence sponsors:9");
    expect(removalText({ reason: "no_refs", detail: "" })).toBe("Cites no evidence");
    expect(removalText({ reason: "no_checkable_content", detail: "" })).toBe("Nothing checkable (no names or numbers)");
  });
  it("derives a city code", () => {
    expect(cityCode("Monterrey")).toBe("MON"); expect(cityCode("Guadalajara")).toBe("GDL");
    expect(cityCode("São Paulo")).toBe("SP"); expect(cityCode("Querétaro")).toBe("QUE");
  });
});
