// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callQlooTool, streamCityPlaybook, streamTourBoard } from "./client";
import { fetchStats } from "./stats";
import { fetchWorkspace } from "../collab/api";
import { SAMPLE_BRIEF } from "./fixtures/lumenVale";

const json = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
const sse = () => new Response("event: done\ndata: {\"type\":\"done\",\"summary\":{}}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
const headersOf = (f: ReturnType<typeof vi.fn>) => (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
async function drain<T>(g: AsyncGenerator<T>) { for await (const _ of g) void _; }

describe("every /api/qloo caller marks test traffic", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => localStorage.clear());
  const calls: Array<[string, (f: typeof fetch) => Promise<unknown>, () => Response]> = [
    ["streamTourBoard", (f) => drain(streamTourBoard(SAMPLE_BRIEF, { fetchImpl: f })), sse],
    ["streamCityPlaybook", (f) => drain(streamCityPlaybook({ artist: "A", artistEntityId: "E", city: "Lima", country: "PE" }, { fetchImpl: f })), sse],
    ["callQlooTool", (f) => callQlooTool("qloo_compare_audiences", {}, { fetchImpl: f }), json],
    ["fetchStats", (f) => fetchStats("trust", { fetchImpl: f }), json],
    ["fetchWorkspace", (f) => fetchWorkspace("abcdefghij", { fetchImpl: f }), json],
  ];
  for (const [name, run, resp] of calls) {
    it(`${name}: x-tiq-test: 1 when tiq.test=1, absent otherwise`, async () => {
      const off = vi.fn(async () => resp());
      await run(off as unknown as typeof fetch).catch(() => {});
      expect(headersOf(off)).not.toHaveProperty("x-tiq-test");
      localStorage.setItem("tiq.test", "1");
      const on = vi.fn(async () => resp());
      await run(on as unknown as typeof fetch).catch(() => {});
      expect(headersOf(on)["x-tiq-test"]).toBe("1");
      expect(headersOf(on)["x-session-id"]).toMatch(/^e2e-/);
    });
  }
});
