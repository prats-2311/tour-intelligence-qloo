import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import { REGISTERED_ROUTE_PATHS } from "@/lib/routeImports";

describe("REGISTERED_ROUTE_PATHS", () => {
  it("lists exactly the pages App.tsx routes (so nav items appear when a branch registers a route)", () => {
    const paths = Array.from(appSource.matchAll(/<Route path="([^"]+)" element=\{<Suspense/g), (m: RegExpMatchArray) => m[1]!);
    expect([...paths].sort()).toEqual([...REGISTERED_ROUTE_PATHS].sort());
  });
});
