import { describe, expect, it } from "vitest";
import { makeSynthetic, syntheticId } from "../scripts/make-synthetic-recording.mjs";

const ID_A = "00000000-2D59-26CF-6425-CA2B3C752437";
const ID_B = "00000000-912F-7318-301D-1242E1B1F71B";
const KEY = "c58a7f74e4e13e85ee2c050ef5a8d1bfffd9a8d2499c76be06b46ddf88bf17ae";
const city = { id: "4013708", name: "Ciudad Juarez", country: "MX", lat: 31.7, lon: -106.4, fanHeat: { value: 61.25, refs: [] }, activation: { value: 22.5, refs: [] }, winnability: { value: 41.75, refs: [] }, verdict: "play", closeCall: false };
const SHOW = {
  recordedAt: "2026-10-17T02:01:52.668Z",
  artist: "Natalia Lafourcade",
  brief: { artist: "Natalia Lafourcade", regions: ["Mexico"], maxStops: 8 },
  boardEvents: [
    { type: "resolve", entity: { entityId: ID_A, name: "Natalia Lafourcade" } },
    { type: "tool_call", tool: "qloo_describe", args: { entity: "Natalia Lafourcade" }, cacheKey: KEY },
    { type: "scoring", scoring: { version: "v", thresholds: { playFan: 70 } } },
    { type: "city_scored", city },
  ],
  playbooks: {
    "4013708": [
      { type: "playbook", playbook: { city: { name: "Ciudad Juarez", country: "MX" }, cards: [{ kind: "sponsors", status: "ok", items: [{ entityId: ID_B, name: "Sample Local Act", type: "urn:entity:brand", category: "brand", affinity: 0.954, popularity: 0.8, index: 0 }], summary: { sharedTags: ["Diverse"] } }] } },
      { type: "narrative", narrative: { status: "ok", cards: { sponsors: { verified: [{ text: "Sample Local Act (0.95) is the strongest match, as Natalia Lafourcade fans love it.", entities: [{ name: "Sample Local Act", entityId: ID_B }], numbers: [0.95], evidence_refs: ["sponsors:0"] }], removed: [] } } } },
    ],
  },
  thisWeek: {},
};

describe("makeSynthetic showcase", () => {
  const out = makeSynthetic(SHOW, "showcase");
  const text = JSON.stringify(out);
  it("leaves no original entity name, id, cache key or artist", () => {
    for (const orig of ["Natalia Lafourcade", "Sample Local Act", ID_A, ID_B, ID_A.toLowerCase(), KEY]) expect(text).not.toContain(orig);
    expect(text).not.toMatch(/Lafourcade|Sample/);
  });
  it("uses the 00000000- prefix for every id and keeps UUID shape", () => {
    const ids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) expect(id.startsWith("00000000-")).toBe(true);
    expect(syntheticId(ID_A)).toBe(syntheticId(ID_A));
    expect(syntheticId(ID_A)).toMatch(/^00000000-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  });
  it("keeps our computed score fields, city names and shape byte-identical", () => {
    const scored = out.boardEvents.find((e) => e.type === "city_scored");
    expect(JSON.stringify(scored.city)).toBe(JSON.stringify(city));
    expect(JSON.stringify(out.boardEvents.find((e) => e.type === "scoring"))).toBe(JSON.stringify(SHOW.boardEvents[2]));
    expect(out.recordedAt).toBe(SHOW.recordedAt);
    expect(out.playbooks["4013708"]).toHaveLength(2);
  });
  it("narrative still contains each declared entity name and number", () => {
    const claim = out.playbooks["4013708"][1].narrative.cards.sponsors.verified[0];
    for (const e of claim.entities) expect(claim.text).toContain(e.name);
    for (const n of claim.numbers) expect(claim.text).toContain(String(n));
    expect(claim.text).toContain("Sample Artist");
  });
  it("is deterministic and replaces tags", () => {
    expect(JSON.stringify(makeSynthetic(SHOW, "showcase"))).toBe(text);
    expect(out.playbooks["4013708"][0].playbook.cards[0].summary.sharedTags).toEqual(["synthetic-tag-01"]);
  });
});

describe("makeSynthetic backtest", () => {
  const mk = (rank) => ({
    runs: [{
      schemaVersion: 1, status: "complete", n: 1, lost: [],
      summary: { qloo_playbook: { scored: 1, hit10: 1, hit20: 1 } },
      cases: [{
        id: "c1", artist: "Coldplay", city: "Vancouver", country: "Canada", activationType: "local_artist",
        realEntity: { name: "Bryan Adams", entityId: ID_B, resolved: true },
        results: {
          qloo_playbook: { status: "ok", rank, top: [{ name: "Elon Musk", entityId: ID_A }, { name: "Drake", entityId: "00000000-C99F-2D78-C989-AFB877EF75F5" }, { name: "Shawn Mendes", entityId: "00000000-3251-9fe9-2f72-f0b5b84ae6a6" }] },
          llm_only: { status: "ok", rank: null, top: [{ name: "Celine Dion" }, { name: "Michael Buble" }] },
        },
      }],
    }],
  });
  it("replaces top lists, keeps the hit at its rank and the metrics", () => {
    const out = makeSynthetic(mk(2), "backtest");
    const text = JSON.stringify(out);
    for (const orig of ["Elon Musk", "Drake", "Shawn Mendes", "Celine Dion", "Michael Buble", ID_A, ID_B]) expect(text).not.toContain(orig);
    const c = out.runs[0].cases[0];
    expect(c.results.qloo_playbook.top).toHaveLength(3);
    expect(c.results.qloo_playbook.top[1].name).toBe("Bryan Adams"); // hit stays at rank 2 (the case's expected name)
    expect(c.results.qloo_playbook.top[1].entityId).toBe(c.realEntity.entityId);
    expect(c.realEntity.entityId.startsWith("00000000-")).toBe(true);
    expect(c.results.llm_only.top).toHaveLength(2);
    expect(c.results.llm_only.top[0]).not.toHaveProperty("entityId");
    expect(out.runs[0].summary).toEqual(mk(2).runs[0].summary);
    expect(c.id).toBe("c1");
  });
  it("a miss has no expected name anywhere in the top list", () => {
    const c = makeSynthetic(mk(null), "backtest").runs[0].cases[0];
    expect(c.results.qloo_playbook.top.map((t) => t.name)).not.toContain("Bryan Adams");
  });
});
