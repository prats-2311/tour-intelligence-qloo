import { describe, expect, it } from "vitest";
import { QlooMcpClient, type McpLike } from "../src/mcpClient.js";

function fake(behaviour: (name: string) => unknown, log: string[] = []): McpLike {
  const client: McpLike = {
    async connect() { log.push("connect"); },
    async callTool({ name }) { return { structuredContent: behaviour(name) }; },
    async close() { log.push("close"); },
  };
  return client;
}

describe("QlooMcpClient", () => {
  it("connects lazily once and returns the structured envelope", async () => {
    const log: string[] = [];
    const c = new QlooMcpClient({ factory: () => fake(() => ({ operation: "describe", status: "ok", results: [] }), log) });
    const a = await c.callTool("qloo_describe", { entity: "x" });
    await c.callTool("qloo_describe", { entity: "y" });
    expect(a.status).toBe("ok");
    expect(log.filter((l) => l === "connect")).toHaveLength(1);
  });

  it("wraps a missing status as an UNKNOWN error envelope", async () => {
    const c = new QlooMcpClient({ factory: () => fake(() => ({ summary: "?" })) });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("UNKNOWN");
  });

  it("reconnects after the child process closes (Review Focus 5)", async () => {
    let created = 0;
    let current: McpLike | undefined;
    const c = new QlooMcpClient({
      factory: () => {
        created += 1;
        current = fake(() => ({ operation: "describe", status: "ok" }));
        return current;
      },
    });
    await c.callTool("qloo_describe", { entity: "x" });
    current?.onclose?.();
    await c.callTool("qloo_describe", { entity: "y" });
    expect(created).toBe(2);
  });

  it("turns a transport failure mid-call into a retryable error envelope", async () => {
    const c = new QlooMcpClient({
      factory: () => ({
        async connect() {}, async close() {},
        async callTool() { throw new Error("EPIPE"); },
      }),
    });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env).toMatchObject({ status: "error", error: { code: "TRANSPORT", retryable: true } });
  });

  it("gives up after maxReconnects failed connects", async () => {
    const c = new QlooMcpClient({
      maxReconnects: 2,
      factory: () => ({ async connect() { throw new Error("ENOENT"); }, async close() {}, async callTool() { return {}; } }),
    });
    const env = await c.callTool("qloo_describe", { entity: "x" });
    expect(env).toMatchObject({ status: "error", error: { code: "UNAVAILABLE", retryable: false } });
  });
});
