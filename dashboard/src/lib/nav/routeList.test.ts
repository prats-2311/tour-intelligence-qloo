import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGISTERED_ROUTE_PATHS } from "@/lib/routeImports";

describe("REGISTERED_ROUTE_PATHS", () => {
  it("lists exactly the pages App.tsx routes (so nav items appear when a branch registers a route)", () => {
    const src = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
    const paths = Array.from(src.matchAll(/<Route path="([^"]+)" element=\{<Suspense/g), (m) => m[1]!);
    expect([...paths].sort()).toEqual([...REGISTERED_ROUTE_PATHS].sort());
  });
});
