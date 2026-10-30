import { describe, expect, it, vi } from "vitest";
import { BudgetGuard } from "../src/budget.js";
import type { GeminiResponse } from "../src/narrative/gemini.js";
import type { QlooCaller } from "../src/qlooCall.js";
import { runStrategist } from "../src/strategist/run.js";
import { executeTool } from "../src/strategist/tools.js";
import type { GatewayEvent } from "../src/types.js";

vi.mock("../src/pipeline/cityPlaybook.js", () => ({
  runCityPlaybook: async function* () {
    yield { type: "playbook", playbook: { cards: [
      { kind: "co_billing", status: "ok", items: [{ name: "Ariel Pink" }, { name: "King Krule" }, { name: "Beach Fossils" }, { name: "Slowdive" }] },
      { kind: "local_moment", status: "ok", items: [{ name: "Ariel Pink", category: "artist" }, { name: "Mid90s" }, { name: "High Fidelity" }] },
      { kind: "sponsors", status: "ok", items: [{ name: "ACLU" }, { name: "Vans" }] },
    ] } };
  },
}));

const call = (name: string, args: Record<string, unknown>): GeminiResponse => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] });
const text = (t: string): GeminiResponse => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const script = (...rs: GeminiResponse[]) => vi.fn(async () => { const r = rs.shift(); if (!r) throw new Error("exhausted"); return r; });
const qlooWith = (results: unknown[]): QlooCaller => ({ call: vi.fn(async () => ({ envelope: { status: "ok", summary: "r", results }, cacheKey: "k", cached: false, stale: false })) }) as unknown as QlooCaller;
const pb = { artist: "A", artistEntityId: "Q1", city: "Los Angeles", country: "US" };
const deps = (generate: ReturnType<typeof vi.fn>, q: QlooCaller = qlooWith([])) => ({ generate, models: ["m"], ceiling: { ceiling: new BudgetGuard({ perSession: 20, perDay: 300 }) }, qloo: q, cities: [] });
const input = { messages: [{ role: "user" as const, text: "hey let's talk about Los angeles" }], context: {}, sessionId: "s" };
async function collect(g: AsyncGenerator<GatewayEvent>) { const o: GatewayEvent[] = []; for await (const e of g) o.push(e); return o; }

describe("tool outputs drop do-not-book acts and non-sponsors", () => {
  it("get_city_playbook: listed acts are gone before the top-3 cut", async () => {
    const out = await executeTool({ name: "get_city_playbook", args: pb }, { qloo: qlooWith([]), cities: [], sessionId: "s" });
    const s = JSON.stringify(out.data);
    expect(s).not.toContain("Ariel Pink");
    expect(s).not.toContain("ACLU");
    const co = (out.data as Array<{ kind: string; top: Array<{ name: string }> }>).find((c) => c.kind === "co_billing")!;
    expect(co.top.map((t) => t.name)).toEqual(["King Krule", "Beach Fossils", "Slowdive"]);
  });
  it("qloo_recommend(artist) results drop the listed act; brand results drop non-sponsors", async () => {
    const q = qlooWith([{ name: "Ariel Pink", entity_id: "A", subtype: "artist" }, { name: "Beach Fossils", entity_id: "B" }]);
    const a = await executeTool({ name: "qloo_recommend", args: { target_type: "artist" } }, { qloo: q, cities: [], sessionId: "s" });
    expect(JSON.stringify(a.data)).not.toContain("Ariel");
    const b = await executeTool({ name: "qloo_recommend", args: { target_type: "brand" } }, { qloo: qlooWith([{ name: "ACLU" }, { name: "Vans" }]), cities: [], sessionId: "s" });
    expect(b.data).toEqual([{ name: "Vans" }]);
  });
});

describe("runStrategist guards the final answer", () => {
  it("does not pass the listed act to Gemini nor collect it", async () => {
    const generate = script(call("get_city_playbook", pb), text("Co-billing: King Krule."));
    await collect(runStrategist(input, deps(generate)));
    expect(JSON.stringify(generate.mock.calls[1]![1])).not.toContain("Ariel Pink");
  });
  it("removes sentences naming the act and reports redactedSentences", async () => {
    const generate = script(text("Local moments include Mid90s. Co-billing options are Ariel Pink, King Krule, and Beach Fossils. Book early."));
    const ev = await collect(runStrategist(input, deps(generate)));
    const m = ev.find((e) => e.type === "strategist_message") as Extract<GatewayEvent, { type: "strategist_message" }>;
    expect(m.text).toBe("Local moments include Mid90s. Book early.");
    expect(m.redactedSentences).toBe(1);
  });
  it("replaces a fully redacted answer with a neutral line", async () => {
    const ev = await collect(runStrategist(input, deps(script(text("Ariel Pink is the pick.")))));
    const m = ev.find((e) => e.type === "strategist_message") as Extract<GatewayEvent, { type: "strategist_message" }>;
    expect(m.text).toBe("That answer named an act we don't recommend booking; ask again or pick another act.");
    expect(m.redactedSentences).toBe(1);
  });
  it("reports 0 on a clean answer", async () => {
    const ev = await collect(runStrategist(input, deps(script(text("All good.")))));
    expect(ev.find((e) => e.type === "strategist_message")).toMatchObject({ text: "All good.", redactedSentences: 0 });
  });
});
