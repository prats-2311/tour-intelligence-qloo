// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollabHttpError, createWorkspace, fetchWorkspace, writeWorkspace } from "./api";
import { loadIdentity, saveIdentity } from "./identity";
import { applyLocal } from "./optimistic";
import { cardThread, emptySnapshot, fieldOf, isSnapshot, timeAgo, WS_ID } from "./types";

const who = { name: "Sam", role: "Manager" as const };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("optimistic apply", () => {
  const base = emptySnapshot("abcdefghij");
  it("status, message and activity (newest first)", () => {
    let s = applyLocal(base, "status", { cityId: "1", status: "confirmed" }, who, 10, "t1");
    s = applyLocal(s, "message", { key: cardThread("1", "sponsors"), text: "hi" }, who, 20, "t2");
    expect(s.statuses["1"]).toMatchObject({ status: "confirmed", name: "Sam" });
    expect(s.threads["card:1:sponsors"]!.messages[0]).toMatchObject({ id: "t2", text: "hi" });
    expect(s.activity.map((e) => e.type)).toEqual(["message", "status"]);
    expect(base.activity).toEqual([]); // input untouched
  });
  it("resolve, a new note reopens, reopen", () => {
    let s = applyLocal(base, "message", { key: "city:1", text: "a" }, who, 1, "a");
    s = applyLocal(s, "resolve", { key: "city:1", resolved: true }, who, 2, "b");
    expect(s.threads["city:1"]).toMatchObject({ resolved: true, resolvedBy: who });
    s = applyLocal(s, "message", { key: "city:1", text: "b" }, who, 3, "c");
    expect(s.threads["city:1"]!.resolved).toBe(false);
    s = applyLocal(s, "resolve", { key: "city:1", resolved: true }, who, 4, "d");
    s = applyLocal(s, "resolve", { key: "city:1", resolved: false }, who, 5, "e");
    expect(s.threads["city:1"]!.resolved).toBe(false);
  });
  it("override keeps the first Qloo value; clear drops it; leads add and remove; activity capped at 200", () => {
    let s = applyLocal(base, "override", { cityId: "1", field: "best_room", value: "B", original: "A" }, who, 1, "o");
    s = applyLocal(s, "override", { cityId: "1", field: "best_room", value: "C", original: "B" }, who, 2, "p");
    expect(s.overrides["1"]!.best_room).toMatchObject({ value: "C", original: "A" });
    s = applyLocal(s, "override_clear", { cityId: "1", field: "best_room" }, who, 3, "q");
    expect(s.overrides).toEqual({});
    s = applyLocal(s, "lead", { cityId: "1", text: "X" }, who, 4, "l1");
    expect(s.leads["1"]).toHaveLength(1);
    s = applyLocal(s, "lead_remove", { cityId: "1", id: "l1" }, who, 5, "r");
    expect(s.leads).toEqual({});
    for (let i = 0; i < 210; i += 1) s = applyLocal(s, "status", { cityId: "1", status: "dropped" }, who, i, `x${i}`);
    expect(s.activity).toHaveLength(200);
  });
});

describe("workspace id", () => {
  it("has the bounds and alphabet the gateway enforces", () => {
    expect(String(WS_ID)).toBe("/^[A-Za-z0-9_-]{10,64}$/"); // test/collab.test.ts in the gateway pins this to its own pattern
    expect(WS_ID.test("a".repeat(10))).toBe(true);
    expect(WS_ID.test("a".repeat(64))).toBe(true);
    expect(WS_ID.test("a".repeat(9))).toBe(false);
    expect(WS_ID.test("a".repeat(65))).toBe(false);
    for (const bad of ["abcde.fghij", "abcde/fghij", "abcde%2Ffghij"]) expect(WS_ID.test(bad), bad).toBe(false);
  });
});

describe("api", () => {
  it("create refuses an answer whose ws id is not a valid id", async () => {
    const f = vi.fn(async (..._a: unknown[]) => json({ ws: "../etc/passwd", snapshot: emptySnapshot("abcdefghij1") }, 201));
    await expect(createWorkspace({ threads: [] }, { fetchImpl: f as never })).rejects.toMatchObject({ status: 502 });
  });
  it("create returns the snapshot and checks the answer's shape", async () => {
    const snap = emptySnapshot("abcdefghij1");
    const f = vi.fn(async (..._a: unknown[]) => json({ ws: "abcdefghij1", snapshot: snap }, 201));
    expect((await createWorkspace({ threads: [] }, { fetchImpl: f as never })).ws).toBe("abcdefghij1");
    expect(f.mock.calls[0]![0]).toBe("/api/qloo/ws");
    expect(JSON.parse(String((f.mock.calls[0]![1] as RequestInit).body))).toEqual({ seed: { threads: [] } });
    await expect(createWorkspace(undefined, { fetchImpl: (async () => json({})) as never })).rejects.toBeInstanceOf(CollabHttpError);
  });
  it("maps errors to CollabHttpError with the server's message", async () => {
    await expect(fetchWorkspace("abcdefghij", { fetchImpl: (async () => json({ error: "Workspace not found or expired" }, 404)) as never })).rejects.toMatchObject({ status: 404, message: "Workspace not found or expired" });
    await expect(writeWorkspace("abcdefghij", "override_clear", {}, { fetchImpl: (async () => new Response("<html>", { status: 502 })) as never })).rejects.toMatchObject({ status: 502 });
  });
  it("posts each op to its path with the session header", async () => {
    const f = vi.fn(async (..._a: unknown[]) => json(emptySnapshot("abcdefghij")));
    await writeWorkspace("abcdefghij", "lead_remove", { id: "x" }, { fetchImpl: f as never });
    expect(f.mock.calls[0]![0]).toBe("/api/qloo/ws/abcdefghij/lead/remove");
    expect((f.mock.calls[0]![1] as { headers: Record<string, string> }).headers["x-session-id"]).toBeTruthy();
  });
});

describe("identity and helpers", () => {
  beforeEach(() => localStorage.clear());
  it("stores name and role locally and ignores junk", () => {
    expect(loadIdentity()).toBeNull();
    saveIdentity({ name: "Rae", role: "Promoter" });
    expect(loadIdentity()).toEqual({ name: "Rae", role: "Promoter" });
    localStorage.setItem("collabIdentity", JSON.stringify({ name: "x", role: "Admin" }));
    expect(loadIdentity()).toBeNull();
    localStorage.setItem("collabIdentity", "{nope");
    expect(loadIdentity()).toBeNull();
  });
  it("relative time, tile fields and snapshot check", () => {
    const now = 1_000_000_000_000;
    expect([timeAgo(now - 5_000, now), timeAgo(now - 5 * 60_000, now), timeAgo(now - 3 * 3_600_000, now), timeAgo(now - 2 * 86_400_000, now)]).toEqual(["just now", "5 min ago", "3 h ago", "2 d ago"]);
    expect([fieldOf("TOP ZONE"), fieldOf("Best room"), fieldOf("Support"), fieldOf("Claims")]).toEqual(["top_zone", "best_room", "support", undefined]);
    expect(isSnapshot(emptySnapshot("abcdefghij"))).toBe(true);
    expect(isSnapshot({})).toBe(false);
  });
});
