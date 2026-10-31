// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTour, getTour, listTours, OWNER_KEY, patchTour, saveTour, ToursError } from "./api";

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SUMMARY = { artist: "Lumen Vale", regions: ["Mexico"], cities: [{ id: "1", name: "Mexico City", country: "Mexico" }] };
type Call = { url: string; init: RequestInit };
let calls: Call[];
const headersOf = (c: Call) => c.init.headers as Record<string, string>;
function stub(handler: (url: string, init: RequestInit, n: number) => Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); return handler(url, init, calls.length); }));
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("owner token", () => {
  it("is created lazily on the first save, stored in tiq.owner and reused", async () => {
    stub((url) => (url === "/api/owners" ? json({ ownerToken: "tok-1" }, 201) : json({ id: "t1", updatedAt: "now" }, 201)));
    expect(calls.length).toBe(0);
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    await saveTour({ summary: SUMMARY, run: {} });
    await saveTour({ summary: SUMMARY, run: {} });
    expect(calls.filter((c) => c.url === "/api/owners").length).toBe(1);
    expect(localStorage.getItem(OWNER_KEY)).toBe("tok-1");
    const tourCalls = calls.filter((c) => c.url === "/api/tours");
    expect(tourCalls.length).toBe(2);
    expect(headersOf(tourCalls[0]!)["x-tiq-owner"]).toBe("tok-1");
    expect(tourCalls[0]!.init.method).toBe("POST");
  });
  it("sends x-tiq-test in test mode only", async () => {
    localStorage.setItem(OWNER_KEY, "tok");
    stub(() => json({ tours: [] }));
    await listTours({});
    expect(headersOf(calls[0]!)["x-tiq-test"]).toBeUndefined();
    localStorage.setItem("tiq.test", "1");
    await listTours({});
    expect(headersOf(calls[1]!)["x-tiq-test"]).toBe("1");
  });
  it("a 401 drops the token, recreates it once and retries once", async () => {
    localStorage.setItem(OWNER_KEY, "stale");
    stub((url, init) => {
      if (url === "/api/owners") return json({ ownerToken: "fresh" }, 201);
      return (init.headers as Record<string, string>)["x-tiq-owner"] === "fresh" ? json({ tours: [] }) : json({ error: "owner required" }, 401);
    });
    await expect(listTours({})).resolves.toEqual([]);
    expect(calls.map((c) => c.url)).toEqual(["/api/tours", "/api/owners", "/api/tours"]);
    expect(localStorage.getItem(OWNER_KEY)).toBe("fresh");
  });
  it("a second 401 gives up with an error (no loop)", async () => {
    localStorage.setItem(OWNER_KEY, "stale");
    stub((url) => (url === "/api/owners" ? json({ ownerToken: "x" }, 201) : json({ error: "owner required" }, 401)));
    await expect(listTours({})).rejects.toMatchObject({ status: 401 });
    expect(calls.filter((c) => c.url === "/api/owners").length).toBe(1);
    expect(calls.filter((c) => c.url !== "/api/owners").length).toBe(2);
  });
  it("a 401/403 that is not the gateway's owner-required keeps the token and is a server error", async () => {
    for (const [status, body] of [[401, { error: "gateway unavailable" }], [403, { error: "x" }], [401, null]] as const) {
      localStorage.setItem(OWNER_KEY, "keep");
      calls.length = 0;
      stub(() => (body ? json(body, status) : new Response("<html>", { status, headers: { "content-type": "text/html" } })));
      await expect(listTours({})).rejects.toMatchObject({ kind: "server", status });
      expect(localStorage.getItem(OWNER_KEY)).toBe("keep");
      expect(calls.length).toBe(1);
    }
  });
  it("private mode (storage throws): the feature is disabled and nothing is requested", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    stub(() => json({}));
    await expect(saveTour({ summary: SUMMARY, run: {} })).rejects.toMatchObject({ kind: "disabled" });
    expect(calls.length).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("tours calls", () => {
  beforeEach(() => localStorage.setItem(OWNER_KEY, "tok"));
  it("listTours builds ?q= and ?status=, omitting empty and 'all'", async () => {
    stub(() => json({ tours: [{ id: "a" }] }));
    await listTours({ q: "lumen vale", status: "draft" });
    expect(calls[0]!.url).toBe("/api/tours?q=lumen+vale&status=draft");
    await listTours({ q: "", status: "all" });
    expect(calls[1]!.url).toBe("/api/tours");
  });
  it("patchTour PATCHes JSON; getTour GETs; deleteTour DELETEs and accepts 204", async () => {
    stub((_url, init) => (init.method === "DELETE" ? json(null, 204) : json({ id: "t1", updatedAt: "u", run: {} })));
    await patchTour("t1", { status: "final" });
    expect(calls[0]!.url).toBe("/api/tours/t1");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ status: "final" });
    expect(headersOf(calls[0]!)["content-type"]).toBe("application/json");
    await getTour("t1");
    expect(calls[1]!.init.method ?? "GET").toBe("GET");
    await expect(deleteTour("t1")).resolves.toBeUndefined();
    expect(calls[2]!.init.method).toBe("DELETE");
  });
  it("maps 409 to the limit message, 404 to not_found, 413 to too_large, 5xx to server", async () => {
    stub(() => json({ error: "limit" }, 409));
    await expect(saveTour({ summary: SUMMARY, run: {} })).rejects.toMatchObject({ kind: "limit", message: "You have 50 saved tours; delete one to save more." });
    stub(() => json({ error: "nope" }, 404));
    await expect(getTour("x")).rejects.toMatchObject({ kind: "not_found" });
    stub(() => json({ error: "big" }, 413));
    await expect(saveTour({ summary: SUMMARY, run: {} })).rejects.toMatchObject({ kind: "too_large" });
    stub(() => json({ error: "boom" }, 503));
    const e = await saveTour({ summary: SUMMARY, run: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(ToursError);
    expect(e.kind).toBe("server");
  });
  it("a network failure is a ToursError of kind network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(listTours({})).rejects.toMatchObject({ kind: "network" });
  });
});
