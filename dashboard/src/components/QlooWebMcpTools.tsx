import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadPlaybook } from "../lib/qloo/playbookStore";
import { useTourBoard } from "../lib/qloo/TourBoardProvider";
import type { PlaybookCard } from "../lib/qloo/types";

type ModelContext = { registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown };
interface WebMcpToolResult { content: { type: "text"; text: string }[] }

const MODES = ["winnability", "density", "without"] as const;
const NO_RUN = { ok: false, error: "No Tour Board run yet" };
const textResult = (value: unknown): WebMcpToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function topItems(card: PlaybookCard): Array<{ name: string; value: number | null }> {
  return card.items.slice(0, 3).map((item) => {
    const name = [item.name, item.label].find((v): v is string => typeof v === "string") ?? "";
    const value = [item.affinity, item.share, item.value].find((v): v is number => typeof v === "number") ?? null;
    return { name, value };
  });
}

/**
 * WebMCP tools for the Qloo tour flow (see WebMcpTools.tsx for the platform notes): a browser agent can
 * read the Tour Board and a city playbook and drive board -> playbook -> book. Every tool returns
 * { ok: false, error } instead of throwing. Registration is re-done when the board's city ids change
 * because the city_id enum is baked into the schema.
 */
export function QlooWebMcpTools() {
  const board = useTourBoard();
  const navigate = useNavigate();
  const location = useLocation();
  // Tools are registered once per city-id set but must always see the freshest state.
  const live = useRef({ board, navigate, location });
  live.current = { board, navigate, location };
  const cityKey = board.state.cities.map((c) => c.id).join(",");

  useEffect(() => {
    const modelContext =
      (document as unknown as { modelContext?: ModelContext }).modelContext ??
      (navigator as unknown as { modelContext?: ModelContext }).modelContext;
    if (typeof modelContext?.registerTool !== "function") return;
    // Detached native methods throw "Illegal invocation"; bind (same as WebMcpTools).
    const registerTool = modelContext.registerTool.bind(modelContext);
    const controller = new AbortController();
    const cityIds = cityKey ? cityKey.split(",") : [];
    const cityIdSchema = { type: "string", description: "A city id from get_tour_board", ...(cityIds.length ? { enum: cityIds } : {}) };

    const sampleQuery = (): string => {
      const { board: b, location: l } = live.current;
      if (b.state.source === "showcase" || new URLSearchParams(l.search).get("showcase") === "1") return "showcase=1";
      const fromUrl = new URLSearchParams(l.search).get("sample");
      const flag = fromUrl ?? (b.state.source === "sample" ? (b.state.sampleSet === "long" ? "long" : "1") : null);
      return flag ? `sample=${flag}` : "";
    };
    const go = (path: string, extra = "") => {
      const q = [extra, sampleQuery()].filter(Boolean).join("&");
      live.current.navigate(q ? `${path}?${q}` : path);
    };
    const hasRun = () => live.current.board.state.cities.length > 0 || live.current.board.state.status !== "idle";
    const findCity = (id: unknown) => live.current.board.state.cities.find((c) => c.id === id);

    function register(tool: {
      name: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean;
      run: (input: Record<string, unknown>) => unknown | Promise<unknown>;
    }) {
      const execute = async (input: Record<string, unknown> | undefined) => {
        try { return textResult(await tool.run(input ?? {})); }
        catch (e) { return textResult({ ok: false, error: e instanceof Error ? e.message : "Tool failed" }); }
      };
      try {
        registerTool(
          { name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: tool.readOnly }, execute },
          { signal: controller.signal },
        );
      } catch {
        // Shape mismatch against whatever this browser shipped -- never let registration touch the app.
      }
    }

    register({
      name: "get_tour_board", readOnly: true,
      description: "Read the current Tour Board: artist, regions, every scored city (verdict, fan heat, activation, winnability) and the current shortlist.",
      inputSchema: { type: "object", properties: {} },
      run() {
        const { state, shortlist } = live.current.board;
        if (!hasRun()) return NO_RUN;
        return {
          ok: true, source: state.source, status: state.status, artist: state.artist?.name ?? null, regions: state.brief?.regions ?? [],
          cities: state.cities.map((c) => ({ id: c.id, name: c.name, country: c.country, verdict: c.verdict, fanHeat: c.fanHeat.value, activation: c.activation.value, winnability: c.winnability.value })),
          shortlist,
        };
      },
    });

    register({
      name: "get_city_playbook", readOnly: true,
      description: "Load one city's playbook (sponsors, promo zones, venues, co-billing...) and return the top items per card plus verified/removed claim counts.",
      inputSchema: { type: "object", properties: { city_id: cityIdSchema }, required: ["city_id"] },
      async run({ city_id }) {
        const city = findCity(city_id);
        const { state } = live.current.board;
        if (!city || !state.artist) return { ok: false, error: "Unknown city" };
        const sample = state.source !== "live";
        const pb = await loadPlaybook({
          artist: state.artist.name, artistEntityId: state.artist.entityId,
          city: { id: city.id, name: city.name, country: city.country }, sample, sampleSet: state.sampleSet, delayMs: sample ? 0 : undefined,
        });
        let verified = 0, removed = 0;
        if (pb.narrative?.status === "ok") {
          for (const c of Object.values(pb.narrative.cards)) { verified += c?.verified.length ?? 0; removed += c?.removed.length ?? 0; }
        }
        return { ok: true, status: pb.status, cards: pb.cards.map((card) => ({ kind: card.kind, status: card.status, top: topItems(card) })), claims: { verified, removed } };
      },
    });

    register({
      name: "open_city", readOnly: false,
      description: "Navigate the app to a city's playbook page.",
      inputSchema: { type: "object", properties: { city_id: cityIdSchema }, required: ["city_id"] },
      run({ city_id }) {
        if (!findCity(city_id)) return { ok: false, error: "Unknown city" };
        go(`/tours/playbook/${encodeURIComponent(String(city_id))}`);
        return { ok: true, opened: city_id };
      },
    });

    register({
      name: "set_comparison_mode", readOnly: false,
      description: "Switch the Tour Board comparison: winnability, density, or without (a generic LLM ranking without Qloo taste evidence).",
      inputSchema: { type: "object", properties: { mode: { type: "string", enum: [...MODES] } }, required: ["mode"] },
      run({ mode }) {
        if (!MODES.includes(mode as (typeof MODES)[number])) return { ok: false, error: `mode must be one of ${MODES.join(", ")}` };
        go("/tours/board", `mode=${mode}`);
        return { ok: true, mode };
      },
    });

    register({
      name: "build_tour_from_shortlist", readOnly: false,
      description: "Build the tour book from the shortlist. Optionally pass city_ids to replace the shortlist first; only Play and Hidden goldmine cities are eligible.",
      inputSchema: { type: "object", properties: { city_ids: { type: "array", items: cityIdSchema } } },
      run({ city_ids }) {
        if (!hasRun()) return NO_RUN;
        const { board: b } = live.current;
        let shortlist = b.shortlist;
        if (city_ids !== undefined) {
          if (!Array.isArray(city_ids)) return { ok: false, error: "city_ids must be an array" };
          const eligible = new Set(b.state.cities.filter((c) => c.verdict === "play" || c.verdict === "hidden_goldmine").map((c) => c.id));
          shortlist = city_ids.filter((id): id is string => typeof id === "string" && eligible.has(id)).slice(0, b.state.brief?.maxStops ?? 8);
          if (shortlist.length === 0) return { ok: false, error: "No eligible cities" };
          b.setShortlist(shortlist);
        }
        go("/tours/book");
        return { ok: true, shortlist };
      },
    });

    register({
      name: "open_tour_book", readOnly: false,
      description: "Navigate the app to the tour book for the current shortlist.",
      inputSchema: { type: "object", properties: {} },
      run() {
        if (!hasRun()) return NO_RUN;
        go("/tours/book");
        return { ok: true };
      },
    });

    return () => controller.abort();
  }, [cityKey]);

  return null;
}
