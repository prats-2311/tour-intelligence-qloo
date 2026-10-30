// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildExampleReport } from "@/lib/agents/exampleReport";
import { stepOf } from "@/lib/qloo/journey";
import { PLACEHOLDER_SHOWCASE } from "@/lib/qloo/placeholderShowcase";
import { parseShowcase, setShowcase, SHOWCASE } from "@/lib/qloo/showcase";
import syntheticShowcase from "@/test/fixtures/showcase.synthetic.json";
import Agents, { CLAUDE_MCP_ADD, IN_PAGE_TOOLS, MCP_JSON, MCP_TOOLS, PLUGIN_ADD, PLUGIN_INSTALL } from "./Agents";
import Landing from "./Landing";

vi.mock("@/components/qloo/TourMap", () => ({ default: () => <div data-testid="map" /> }));

/** The synthetic recording relabelled as Mac DeMarco's Los Angeles run, with a do-not-book act and a non-sponsor planted in the cards the report reads. */
function laShowcase() {
  const raw = JSON.parse(JSON.stringify(syntheticShowcase));
  const id = Object.keys(raw.playbooks)[0]!;
  for (const e of raw.boardEvents) if (e.type === "city_scored" && e.city.id === id) e.city.name = "Los Angeles";
  for (const e of raw.playbooks[id]) {
    if (e.type !== "playbook") continue;
    for (const c of e.playbook.cards) {
      const proto = c.items[0] ?? {};
      if (c.kind === "sponsors") c.items = ["Red Cross", "Stüssy", "OBEY", "Kith"].map((name, i) => ({ ...proto, name, artistRank: i + 1, cityRank: null }));
      if (c.kind === "co_billing") c.items = [{ ...(c.items[0] ?? {}), name: "Ariel Pink" }, { ...(c.items[0] ?? {}), name: "Mac Miller Tribute" }];
    }
  }
  raw.artist = "Mac DeMarco";
  raw.recordedAt = "2026-10-28T09:52:30.982Z";
  return raw;
}

const mount = () => render(<MemoryRouter initialEntries={["/agents"]}><Routes><Route path="/agents" element={<Agents />} /></Routes></MemoryRouter>);

beforeEach(() => { setShowcase(parseShowcase(laShowcase())); });
afterEach(() => { cleanup(); setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Agents page", () => {
  it("renders the hero, the plugin steps and the direct connection", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Use Tour Intelligence from your AI agent" })).toBeTruthy();
    expect(screen.getByText("Installs the MCP connection and a plan-tour skill.")).toBeTruthy();
    expect(screen.getByText(PLUGIN_ADD)).toBeTruthy();
    expect(screen.getByText(PLUGIN_INSTALL)).toBeTruthy();
    expect(document.body.textContent).toContain(CLAUDE_MCP_ADD);
    expect(JSON.parse(MCP_JSON).mcpServers["tour-intel"]).toEqual({ type: "http", url: "https://tour-intel-mcp-public-602700957663.us-central1.run.app/mcp" });
    expect(screen.getByText(/MCP clients that support HTTP servers/)).toBeTruthy();
  });

  it("lists the nine public tools, the prompts and the resource", () => {
    mount();
    const names = within(screen.getByRole("table")).getAllByRole("rowheader").map((r) => r.textContent);
    expect(names).toEqual(["find_tour_markets", "get_city_playbook", "suggest_support_acts", "rank_venues", "get_local_moment", "get_sponsors_by_age", "get_advance_risks", "get_team_notes", "get_tour_report"]);
    expect(MCP_TOOLS).toHaveLength(9);
    expect(screen.getByText("plan_tour")).toBeTruthy();
    expect(screen.getByText("brief_for_sponsor_meeting")).toBeTruthy();
    expect(screen.getByText("tour-intel://about")).toBeTruthy();
  });

  it("lists the eleven in-page tools and the example prompts", () => {
    mount();
    expect(within(screen.getByTestId("webmcp-tools")).getAllByRole("listitem")).toHaveLength(11);
    expect(IN_PAGE_TOOLS).toContain("add_team_note");
    expect(screen.getByText("Plan where Mac DeMarco should tour in Mexico and the US, and give me a sponsor report.")).toBeTruthy();
    expect(screen.getByText("Summarise where my team landed on LA: <workspace link>")).toBeTruthy();
  });

  it("states the limits and privacy", () => {
    mount();
    const t = document.body.textContent!;
    for (const s of ["30 requests per 10 minutes per IP", "2 regions and 3 stops per board", "shared daily Qloo budget", "not ticket forecasts", "readable by anyone who has them", "No personal data is sent to Qloo"]) expect(t).toContain(s);
  });

  it("has a copy button on every code block that copies its text", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    mount();
    const blocks = document.querySelectorAll("pre");
    const buttons = screen.getAllByRole("button", { name: /^Copy:/ });
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    expect(buttons).toHaveLength(blocks.length);
    fireEvent.click(screen.getByRole("button", { name: "Copy: Install the plugin" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PLUGIN_INSTALL));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("falls back to execCommand when the clipboard API is missing", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy: Add the plugin marketplace" }));
    await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("shows the example report built from the recording, without hidden acts or non-sponsors", () => {
    mount();
    expect(screen.getByTestId("report-label").textContent).toBe("Example output, built from the recorded Mac DeMarco run (28 Oct 2026)");
    const md = screen.getByLabelText("Example get_tour_report markdown").textContent!;
    expect(md).toContain("# Tour report: Mac DeMarco");
    expect(md).toContain("### Los Angeles");
    expect(md).toContain("Stüssy");
    expect(md).toContain("Mac Miller Tribute");
    expect(md).not.toContain("Ariel Pink");
    expect(md).not.toContain("Red Cross");
    expect(md).toMatch(/\*\*Claims:\*\* \d+ verified · \d+ removed/);
  });

  it("derives the report from whatever recording is loaded, and labels the placeholder as a sample", () => {
    setShowcase(parseShowcase(PLACEHOLDER_SHOWCASE));
    const r = buildExampleReport(SHOWCASE);
    expect(r.label).toBe(`Example output, built from the sample ${SHOWCASE.artist} run`);
    expect(r.markdown).toContain(`# Tour report: ${SHOWCASE.artist}`);
    expect(r.markdown).toContain("| City | Verdict | Fan heat | Activation | Winnability |");
  });

  it("the tools table scrolls inside a focusable named region", () => {
    mount();
    const r = screen.getByRole("table", { name: "Public MCP tools" }).closest('[role="region"]') as HTMLElement;
    expect(r.getAttribute("tabindex")).toBe("0");
    expect(r.getAttribute("aria-label")).toMatch(/scrolls sideways/);
  });
  it("is not a journey step", () => { expect(stepOf("/agents")).toBeNull(); });
});

describe("Landing link", () => {
  it("links to /agents under the proof and preview links", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Use it from your AI agent →" });
    expect(link.getAttribute("href")).toBe("/agents");
    const preview = screen.getByRole("link", { name: "Preview: what's next (concept) →" });
    expect(preview.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
