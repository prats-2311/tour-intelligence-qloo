import { isRoutingBrief, showcaseParam, showcaseQuery } from "@/lib/qloo/showcase";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadPlaybook } from "../lib/qloo/playbookStore";
import { fetchAdvance } from "../lib/qloo/client";
import { loadSegments } from "../lib/qloo/segmentStore";
import { BAND_LABEL, displayItems } from "../lib/qloo/segments";
import { useWorkspace } from "../lib/collab/workspaceContext";
import { STATUSES, STATUS_LABEL, LIMITS, cardThread, cityThread, type CityStatus } from "../lib/collab/types";
import { useTourBoard } from "../lib/qloo/TourBoardProvider";
import { applyDoNotBook, visibleClaimTotals } from "../lib/qloo/doNotBook";
import type { PlaybookCard } from "../lib/qloo/types";

type ModelContext = { registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown };
interface WebMcpToolResult { content: { type: "text"; text: string }[] }

const MODES = ["winnability", "density", "without"] as const;
const CARD_KINDS = ["sponsors", "merch", "promo_zones", "local_moment", "venue_fit", "co_billing", "talent"] as const;
const STATUS_NAMES = STATUSES.map((s) => STATUS_LABEL[s]);
const NO_RUN = { ok: false, error: "No Tour Board run yet" };
const textResult = (value: unknown): WebMcpToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function topItems(card: PlaybookCard): Array<{ name: string; value: number | null }> {
  return applyDoNotBook(card).card.items.slice(0, 3).map((item) => {
    const name = [item.name, item.label].find((v): v is string => typeof v === "string") ?? "";
    const value = [item.affinity, item.share, item.value].find((v): v is number => typeof v === "number") ?? null;
    return { name, value };
  });
}

/**
 * WebMCP (https://developer.chrome.com/docs/ai/webmcp) lets an AI agent running in the SAME browser tab as the
 * visitor call this page's own functions via document.modelContext.registerTool(tool, { signal }). It is
 * unrelated to the Qloo gateway. Works in Chrome with WebMCP enabled or on a build with VITE_WEBMCP_OT_TOKEN
 * (Edge 147+ ships it); elsewhere document.modelContext is undefined and this component does nothing.
 * navigator.modelContext is a deprecated fallback. Cleanup is an AbortController passed at registration.
 *
 * WebMCP tools for the Qloo tour flow (11 tools): a browser agent can
 * read the Tour Board and a city playbook and drive board -> playbook -> book. Every tool returns
 * { ok: false, error } instead of throwing. Registration is re-done when the board's city ids change
 * because the city_id enum is baked into the schema.
 */
export function QlooWebMcpTools() {
  const board = useTourBoard();
  const navigate = useNavigate();
  const location = useLocation();
  // Tools are registered once per city-id set but must always see the freshest state.
  const workspace = useWorkspace();
  const live = useRef({ board, navigate, location, workspace });
  live.current = { board, navigate, location, workspace };
  const cityKey = board.state.cities.map((c) => c.id).join(",");

  useEffect(() => {
    const modelContext =
      (document as unknown as { modelContext?: ModelContext }).modelContext ??
      (navigator as unknown as { modelContext?: ModelContext }).modelContext;
    if (typeof modelContext?.registerTool !== "function") return;
    // Detached native methods throw "Illegal invocation"; bind (a detached registerTool loses its [[this]]).
    const registerTool = modelContext.registerTool.bind(modelContext);
    const controller = new AbortController();
    const cityIds = cityKey ? cityKey.split(",") : [];
    const cityIdSchema = { type: "string", description: "A city id from get_tour_board", ...(cityIds.length ? { enum: cityIds } : {}) };

    const sampleQuery = (): string => {
      const { board: b, location: l } = live.current;
      const showParam = showcaseParam(new URLSearchParams(l.search).get("showcase"));
      if (b.state.source === "showcase" || showParam !== null) return showcaseQuery(b.state.source === "showcase" ? isRoutingBrief(b.state.brief) : showParam === "routing").slice(1);
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
        const { verified, removed } = pb.narrative?.status === "ok" ? visibleClaimTotals(pb.narrative.cards) : { verified: 0, removed: 0 };
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

    register({
      name: "get_sponsors_by_age", readOnly: true,
      description: "Brands that fans in each age group rank highly in one city (age only). Indexes are over- or under-index versus the average audience, not shares of fans. Makes a live Qloo lookup.",
      inputSchema: { type: "object", properties: { city_id: cityIdSchema }, required: ["city_id"] },
      async run({ city_id }) {
        const city = findCity(city_id);
        const { state } = live.current.board;
        if (!city || !state.artist) return { ok: false, error: "Unknown city" };
        const seg = await loadSegments({ artistId: state.artist.entityId, artist: state.artist.name, city: { id: city.id, name: city.name, country: city.country, lat: city.lat, lon: city.lon } });
        if (seg.status !== "done") return { ok: false, error: "Sponsors by age are still loading" };
        const d = seg.data;
        if (d.status === "unavailable") return { ok: false, error: d.message ?? "Sponsors by age are not available for this city" };
        return {
          ok: true, status: d.status, ...(d.message ? { message: d.message } : {}),
          bands: d.bands.filter((b) => b.status === "ok").map((b) => ({ age: BAND_LABEL[b.band], index: b.index, brands: displayItems(b).items.slice(0, 5).map((i) => i.name) })),
        };
      },
    });

    register({
      name: "get_advance_risks", readOnly: true,
      description: "Advance and risks for one city over the tour's date window: weather, public holidays, visa and customs, equipment. Makes live lookups; needs a date window on the brief.",
      inputSchema: { type: "object", properties: { city_id: cityIdSchema }, required: ["city_id"] },
      async run({ city_id }) {
        const city = findCity(city_id);
        const { state } = live.current.board;
        if (!city) return { ok: false, error: "Unknown city" };
        const window = state.brief?.dateWindow;
        if (!window) return { ok: false, error: "This tour has no date window, so there are no dates to check" };
        if (state.source === "sample" && state.sampleSet !== "showcase") return { ok: false, error: "Advance details are not available for sample cities" };
        const a = await fetchAdvance({ city: city.name, country: city.country, window, lat: city.lat, lon: city.lon, ...(state.brief?.artistCountry ? { artistCountry: state.brief.artistCountry } : {}) });
        const web = (w: typeof a.visa) => (w.status === "ok" ? { summary: w.summary, ...(w.leadTime ? { leadTime: w.leadTime } : {}), points: w.items.slice(0, 3).map((i) => i.text) } : { unavailable: w.message });
        return {
          ok: true, window,
          weather: a.weather.status === "ok" ? { highC: a.weather.tempMaxC.mean, lowC: a.weather.tempMinC.mean, rainDaysShare: a.weather.rainDaysShare, note: a.weather.note } : { unavailable: a.weather.message },
          holidays: a.holidays.status === "ok" ? a.holidays.items.filter((h) => h.near).slice(0, 5).map((h) => ({ date: h.date, name: h.name })) : { unavailable: a.holidays.message },
          visa: web(a.visa), equipment: web(a.equipment),
        };
      },
    });

    register({
      name: "get_team_notes", readOnly: true,
      description: "Read the shared team workspace: city statuses, open note threads, resolved thread count and decisions (field overrides). Empty when no workspace has been started.",
      inputSchema: { type: "object", properties: {} },
      run() {
        const w = live.current.workspace;
        if (!w.enabled) return { ok: false, error: "Team notes are not available right now" };
        const s = w.snapshot;
        if (!s) return { ok: true, workspace: w.ws, statuses: [], openThreads: [], resolvedThreads: 0, decisions: [], note: "No team notes yet" };
        const threads = Object.entries(s.threads);
        return {
          ok: true, workspace: s.ws,
          statuses: Object.entries(s.statuses).map(([city_id, e]) => ({ city_id, status: STATUS_LABEL[e.status], by: `${e.name} (${e.role})` })),
          openThreads: threads.filter(([, t]) => !t.resolved).map(([key, t]) => ({ key, messages: t.messages.length, latest: t.messages.at(-1) ? { by: `${t.messages.at(-1)!.name} (${t.messages.at(-1)!.role})`, text: t.messages.at(-1)!.text } : null })),
          resolvedThreads: threads.filter(([, t]) => t.resolved).length,
          decisions: Object.entries(s.overrides).flatMap(([city_id, fields]) => Object.entries(fields).map(([field, o]) => ({ city_id, field, value: o!.value, by: o!.name }))),
        };
      },
    });

    register({
      name: "add_team_note", readOnly: false,
      description: "Post a note to the team workspace as the person using the app. Needs the person's name and role to be set in the app first. Attaches to a city, or to one of its cards when card_kind is given.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: `The note, up to ${LIMITS.text} characters` }, city_id: cityIdSchema, card_kind: { type: "string", enum: [...CARD_KINDS] } },
        required: ["text"],
      },
      async run({ text, city_id, card_kind }) {
        const w = live.current.workspace;
        if (!w.enabled) return { ok: false, error: "Team notes are not available right now" };
        if (!w.identity) return { ok: false, error: "No name or role is set. Ask the user to set their name and role in the app (the chip in the header), then try again." };
        const note = typeof text === "string" ? text.trim() : "";
        if (!note) return { ok: false, error: "text is required" };
        if (note.length > LIMITS.text) return { ok: false, error: `text must be at most ${LIMITS.text} characters` };
        const onPlaybook = /^\/tours\/playbook\/([^/]+)/.exec(live.current.location.pathname)?.[1];
        const id = city_id ?? (onPlaybook ? decodeURIComponent(onPlaybook) : undefined);
        if (id === undefined) return { ok: false, error: "city_id is required: notes attach to a city" };
        if (!findCity(id)) return { ok: false, error: "Unknown city" };
        if (card_kind !== undefined && !(CARD_KINDS as readonly string[]).includes(card_kind as string)) return { ok: false, error: `card_kind must be one of ${CARD_KINDS.join(", ")}` };
        const key = card_kind ? cardThread(String(id), String(card_kind)) : cityThread(String(id));
        const ok = await w.write("message", { key, text: note });
        return ok ? { ok: true, key, as: `${w.identity.name} (${w.identity.role})` } : { ok: false, error: w.error ?? "The note was not posted" };
      },
    });

    register({
      name: "set_city_status", readOnly: false,
      description: "Set a city's team status in the shared workspace, as the person using the app: Considering, Confirmed, On hold or Dropped. Needs the person's name and role to be set in the app first.",
      inputSchema: { type: "object", properties: { city_id: cityIdSchema, status: { type: "string", enum: STATUS_NAMES } }, required: ["city_id", "status"] },
      async run({ city_id, status }) {
        const w = live.current.workspace;
        if (!w.enabled) return { ok: false, error: "Team notes are not available right now" };
        if (!w.identity) return { ok: false, error: "No name or role is set. Ask the user to set their name and role in the app (the chip in the header), then try again." };
        if (!findCity(city_id)) return { ok: false, error: "Unknown city" };
        const value = (STATUSES as readonly string[]).find((s) => STATUS_LABEL[s as CityStatus].toLowerCase() === String(status).trim().toLowerCase());
        if (!value) return { ok: false, error: `status must be one of ${STATUS_NAMES.join(", ")}` };
        const ok = await w.write("status", { cityId: city_id, status: value });
        return ok ? { ok: true, city_id, status: STATUS_LABEL[value as CityStatus] } : { ok: false, error: w.error ?? "The status was not saved" };
      },
    });

    return () => controller.abort();
  }, [cityKey]);

  return null;
}
