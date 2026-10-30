import { describe, expect, it } from "vitest";
import { buildCrumbs } from "./breadcrumbs";

const labels = (pathname: string, artist: string | null = "Mac DeMarco", cityName: string | null = "Los Angeles") =>
  buildCrumbs({ pathname, artist, cityName }).map((c) => c.label);

describe("buildCrumbs", () => {
  it("has none on the landing page", () => expect(buildCrumbs({ pathname: "/", artist: "X", cityName: null })).toEqual([]));
  it("board", () => expect(labels("/tours/board")).toEqual(["Overview", "Mac DeMarco tour", "Tour Board"]));
  it("playbook includes the city name", () => expect(labels("/tours/playbook/42")).toEqual(["Overview", "Mac DeMarco tour", "Tour Board", "Los Angeles", "Playbook"]));
  it("pitch sheet is a known route: playbook city, then 'Pitch sheet · Brand'", () => {
    expect(labels("/tours/pitch/42/St%C3%BCssy")).toEqual(["Overview", "Mac DeMarco tour", "Tour Board", "Los Angeles", "Pitch sheet · Stüssy"]);
    expect(labels("/tours/pitch/42/OBEY")).not.toContain("Page not found");
    const trail = buildCrumbs({ pathname: "/tours/pitch/42/OBEY", artist: null, cityName: null });
    expect(trail.map((c) => c.label)).toEqual(["Overview", "Your tour", "Tour Board", "City", "Pitch sheet · OBEY"]);
    expect(trail[3]!.href).toBe("/tours/playbook/42");
  });
  it("book", () => expect(labels("/tours/book")).toEqual(["Overview", "Mac DeMarco tour", "Tour Book"]));
  it("insights, new and legacy paths", () => {
    expect(labels("/tours/insights")).toEqual(["Overview", "Mac DeMarco tour", "Charts"]);
    expect(labels("/insights")).toEqual(["Overview", "Mac DeMarco tour", "Charts"]);
  });
  it("budget", () => expect(labels("/tours/budget")).toEqual(["Overview", "Mac DeMarco tour", "Budget"]));
  it("proof, agents and v2 are not under a tour", () => {
    expect(labels("/proof")).toEqual(["Overview", "How we tested it"]);
    expect(labels("/agents")).toEqual(["Overview", "Use from your AI agent"]);
    expect(labels("/v2")).toEqual(["Overview", "What's next"]);
  });
  it("falls back when there is no artist or city name", () => {
    expect(labels("/tours/board", null)).toEqual(["Overview", "Your tour", "Tour Board"]);
    expect(labels("/tours/playbook/9", null, null)).toEqual(["Overview", "Your tour", "Tour Board", "City", "Playbook"]);
  });
  it("only the last crumb is current and has no link; the city is plain text", () => {
    const c = buildCrumbs({ pathname: "/tours/playbook/42", artist: "Mac DeMarco", cityName: "Los Angeles" });
    expect(c.map((x) => x.href)).toEqual(["/", "/tours/board", "/tours/board", undefined, undefined]);
    expect(c.map((x) => !!x.current)).toEqual([false, false, false, false, true]);
  });
  it("unknown paths get a not-found crumb", () => expect(labels("/nope")).toEqual(["Overview", "Page not found"]));
});
