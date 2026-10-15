import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { QlooEnvelope } from "./types.js";

export interface McpLike {
  connect(): Promise<void>;
  callTool(req: { name: string; arguments: Record<string, unknown> }): Promise<{ structuredContent?: unknown }>;
  close(): Promise<void>;
  onclose?: () => void;
}

export function defaultFactory(): McpLike {
  const client = new Client({ name: "qloo-gateway", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.env.QLOO_BIN ?? "qloo",
    args: ["mcp"],
    env: process.env as Record<string, string>,
  });
  const wrapper: McpLike = {
    async connect() {
      transport.onclose = () => wrapper.onclose?.();
      await client.connect(transport);
    },
    async callTool(req) {
      return (await client.callTool(req)) as { structuredContent?: unknown };
    },
    async close() { await client.close(); },
  };
  return wrapper;
}

function errorEnvelope(operation: string, code: string, retryable: boolean, recovery: string): QlooEnvelope {
  return { operation, status: "error", summary: recovery, results: [], result_count: 0, error: { code, retryable, recovery } };
}

export class QlooMcpClient {
  private client: McpLike | undefined;
  private readonly factory: () => McpLike;
  private readonly maxReconnects: number;

  constructor(opts: { factory: () => McpLike; maxReconnects?: number }) {
    this.factory = opts.factory;
    this.maxReconnects = opts.maxReconnects ?? 3;
  }

  private async ensure(): Promise<McpLike | undefined> {
    if (this.client) return this.client;
    for (let attempt = 0; attempt < this.maxReconnects; attempt += 1) {
      const candidate = this.factory();
      try {
        candidate.onclose = () => { if (this.client === candidate) this.client = undefined; };
        await candidate.connect();
        this.client = candidate;
        return candidate;
      } catch {
        await candidate.close().catch(() => undefined);
      }
    }
    return undefined;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<QlooEnvelope> {
    const operation = name.replace(/^qloo_/, "");
    const client = await this.ensure();
    if (!client) return errorEnvelope(operation, "UNAVAILABLE", false, "Cannot start qloo mcp. Check the harness install and QLOO_API_KEY.");
    try {
      const result = await client.callTool({ name, arguments: args });
      const raw = (result.structuredContent ?? {}) as Partial<QlooEnvelope>;
      if (raw.status === undefined) {
        return { ...raw, operation, status: "error", error: { code: "UNKNOWN", retryable: false, recovery: "Malformed Qloo result", ...(raw.error ?? {}) } } as QlooEnvelope;
      }
      return raw as QlooEnvelope;
    } catch (err) {
      this.client = undefined;
      await client.close().catch(() => undefined);
      return errorEnvelope(operation, "TRANSPORT", true, `qloo mcp transport failed: ${(err as Error).message}`);
    }
  }

  async health(): Promise<{ connected: boolean; ready: boolean }> {
    const env = await this.callTool("qloo_capabilities", {});
    const ready = Boolean((env as { adapter?: { ready?: boolean } }).adapter?.ready ?? env.status !== "error");
    return { connected: this.client !== undefined, ready };
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}
