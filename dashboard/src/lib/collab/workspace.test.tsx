// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChapterTeam } from "@/components/collab/ChapterTeam";
import { NotesButton } from "@/components/collab/Notes";
import { SponsorLeads } from "@/components/collab/SponsorLeads";
import { CityStatusChip, StatusPicker } from "@/components/collab/Status";
import { TeamBar } from "@/components/collab/TeamBar";
import { AdvanceSheet } from "@/components/playbook/AdvanceSheet";
import { fakeCollabBackend } from "@/test/fakeCollabBackend";
import { LUMEN_VALE_SAMPLE } from "../qloo/fixtures/lumenVale";
import { SAMPLE_PLAYBOOK_CITY_IDS, samplePlaybookEvents } from "../qloo/fixtures/lumenValePlaybooks";
import { parseShowcase, setShowcase } from "../qloo/showcase";
import { PLACEHOLDER_SHOWCASE } from "../qloo/placeholderShowcase";
import { TourBoardProvider } from "../qloo/TourBoardProvider";
import { saveIdentity } from "./identity";
import { cardThread, cityThread } from "./types";
import { useWorkspace } from "./workspaceContext";
import { WorkspaceProvider } from "./WorkspaceProvider";

const ME = { name: "Sam", role: "Manager" as const };
const CITY = SAMPLE_PLAYBOOK_CITY_IDS[0];

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; }
function Harness() {
  const w = useWorkspace();
  return (
    <>
      <TeamBar cities={[{ id: CITY, name: "Home" }]} tourThread="tour:board" />
      <StatusPicker cityId={CITY} />
      <CityStatusChip cityId={CITY} />
      <NotesButton threadKey={cardThread(CITY, "sponsors")} title="Sponsors" />
      <NotesButton threadKey={cityThread(CITY)} title="Home" label="City notes" />
      <AdvanceSheet cityId={CITY} editable rows={[{ label: "TOP ZONE", value: "Old Quarter" }, { label: "CLAIMS", value: "3 verified" }]} />
      <SponsorLeads cityId={CITY} />
      <ChapterTeam cityId={CITY} />
      <Link to="/tours/book?showcase=1">book</Link>
      <span data-testid="enabled">{String(w.enabled)}</span>
      <Where />
    </>
  );
}
function mount(path = "/tours/board?showcase=1") {
  return render(<MemoryRouter initialEntries={[path]}><TourBoardProvider><WorkspaceProvider><Harness /></WorkspaceProvider></TourBoardProvider></MemoryRouter>);
}
const where = () => screen.getByTestId("where").textContent ?? "";
const ready = async () => { await waitFor(() => expect(where()).toMatch(/ws=testws/)); await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("true")); };

let be: ReturnType<typeof fakeCollabBackend>;
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const events = LUMEN_VALE_SAMPLE;
  setShowcase(parseShowcase({
    ...PLACEHOLDER_SHOWCASE, recordedAt: "2026-10-16T10:00:00.000Z", boardEvents: events,
    playbooks: Object.fromEntries(SAMPLE_PLAYBOOK_CITY_IDS.map((id) => [id, samplePlaybookEvents(id)])), thisWeek: {},
  }));
  localStorage.clear();
  saveIdentity(ME);
  be = fakeCollabBackend();
  vi.stubGlobal("fetch", be.fetchImpl);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });

describe("workspace on the recorded example", () => {
  it("opens a private seeded workspace and keeps its id in the URL", async () => {
    mount();
    await ready();
    const create = be.calls.find((c) => c.method === "POST" && c.path === "");
    expect(create?.body?.seed).toBeTruthy();
    expect((create!.body!.seed as { threads: unknown[] }).threads.length).toBeGreaterThan(3);
    expect(where()).toMatch(/^\/tours\/board\?showcase=1&ws=testws\d+/);
    expect(screen.getAllByTestId("status-chip").length).toBeGreaterThanOrEqual(1);
  });
  it("two visitors never share a workspace", async () => {
    const a = mount(); await ready(); const first = where(); a.unmount();
    mount(); await waitFor(() => expect(be.docs.size).toBe(2));
    await waitFor(() => expect(where()).toMatch(/ws=/));
    expect(where()).not.toBe(first);
  });
  it("keeps ws on every page", async () => {
    mount(); await ready();
    const ws = /ws=(\w+)/.exec(where())![1];
    fireEvent.click(screen.getByRole("link", { name: "book" }));
    await waitFor(() => expect(where()).toBe(`/tours/book?showcase=1&ws=${ws}`));
  });
  it("opens the workspace named in a shared link without creating another", async () => {
    mount(); await ready();
    const ws = /ws=(\w+)/.exec(where())![1]!;
    cleanup();
    be.calls.length = 0;
    mount(`/tours/board?showcase=1&ws=${ws}`);
    await waitFor(() => expect(be.calls.some((c) => c.method === "GET" && c.path === `/${ws}`)).toBe(true));
    expect(be.calls.some((c) => c.method === "POST" && c.path === "")).toBe(false);
  });
  it("starts a fresh seeded workspace when the linked one has expired", async () => {
    mount("/tours/board?showcase=1&ws=expired0000001");
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    expect(where()).not.toMatch(/expired0000001/);
  });
});

describe("degrades without a gateway", () => {
  it("hides every collaboration control when the server answers 503", async () => {
    be = fakeCollabBackend({ status: 503 });
    vi.stubGlobal("fetch", be.fetchImpl);
    mount();
    await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("false"));
    expect(screen.queryByTestId("team-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: /Notes for/ })).toBeNull();
    expect(screen.queryByTestId("status-picker")).toBeNull();
    expect(where()).toBe("/tours/board?showcase=1");
  });
  it("renders nothing outside a provider", () => {
    render(<MemoryRouter><Harness /></MemoryRouter>);
    expect(screen.queryByTestId("team-bar")).toBeNull();
    expect(screen.getByText("Old Quarter")).toBeTruthy();
  });
});

describe("notes", () => {
  it("asks who is writing on the first note, then renders plain text with @Role styling", async () => {
    localStorage.clear();
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    const box = await screen.findByLabelText("Add a note");
    fireEvent.change(box, { target: { value: "<img src=x onerror=alert(1)> @Promoter can you check?" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const name = await screen.findByLabelText("Your name");
    expect(screen.getAllByText(/Anyone with this link can see and add notes/).length).toBeGreaterThan(0);
    fireEvent.change(name, { target: { value: "Rae" } });
    fireEvent.click(screen.getByLabelText("Promoter"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/can you check/)).toBeTruthy());
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeTruthy();
    expect(screen.getByText("@Promoter").className).toContain("text-gold");
    expect(JSON.parse(localStorage.getItem("collabIdentity")!)).toEqual({ name: "Rae", role: "Promoter" });
    expect(be.calls.find((c) => c.path.endsWith("/message"))?.body).toMatchObject({ name: "Rae", role: "Promoter", key: cardThread(CITY, "sponsors") });
  });
  it("shows the note at once (optimistic), resolves and reopens", async () => {
    be = fakeCollabBackend({ delayMs: 200 });
    vi.stubGlobal("fetch", be.fetchImpl);
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    fireEvent.change(await screen.findByLabelText("Add a note"), { target: { value: "Hello team" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(screen.getByText("Hello team")).toBeTruthy()); // before the 200 ms answer
    expect(be.calls.filter((c) => c.path.endsWith("/message")).length).toBeLessThanOrEqual(1);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /Mark resolved/ }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Reopen" })).toBeTruthy());
    expect(within(dialog).getByText(/Resolved by Sam/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Mark resolved/ })).toBeTruthy());
  });
  it("tags seeded notes as Demo teammate and explains the demo", async () => {
    mount(); await ready();
    const doc = [...be.docs.values()][0]!;
    be.put({ ...doc, rev: doc.rev + 1, threads: { ...doc.threads, [cityThread(CITY)]: { resolved: false, messages: [{ id: "d1", name: "Leo", role: "Booking agent", text: "Seeded note", at: Date.now() - 60_000, demo: true }] } } });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    fireEvent.click(await screen.findByRole("button", { name: /City notes for Home: 1 note/ }));
    await waitFor(() => expect(screen.getAllByText("Demo teammate").length).toBeGreaterThan(0));
    expect(screen.getByTestId("demo-banner").textContent).toMatch(/fictional teammates/);
    expect(screen.getByText(/1 min ago/)).toBeTruthy();
  });
});

describe("status, overrides and leads", () => {
  it("sets a status that shows as a chip with who and when", async () => {
    mount(); await ready();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "on_hold" } });
    await waitFor(() => expect(screen.getAllByTestId("status-chip").some((c) => /On hold/.test(c.textContent ?? ""))).toBe(true));
    const chip = screen.getAllByTestId("status-chip").find((c) => /On hold/.test(c.textContent ?? ""))!;
    expect(chip.getAttribute("title")).toMatch(/On hold by Sam \(Manager\)/);
  });
  it("overrides a tile, keeps Qloo's value underneath and reverts", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Top zone" }));
    fireEvent.change(screen.getByLabelText("Team value for Top zone"), { target: { value: "Harbour" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("team-value").textContent).toBe("Harbour"));
    expect(screen.getByTestId("qloo-suggested").textContent).toBe("Qloo suggested: Old Quarter");
    fireEvent.click(screen.getByRole("button", { name: "Revert to Qloo" }));
    await waitFor(() => expect(screen.queryByTestId("team-value")).toBeNull());
    expect(screen.getByText("Old Quarter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Support" })).toBeNull(); // only the three tiles are editable
  });
  it("adds and removes a sponsor lead labelled as added by the team", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a lead" }));
    fireEvent.change(screen.getByLabelText("Sponsor lead"), { target: { value: "Harbour Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Save lead" }));
    const lists = await screen.findAllByText(/Harbour Coffee/);
    expect(lists.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Added by the team/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove lead Harbour Coffee" }));
    await waitFor(() => expect(screen.queryByText(/Harbour Coffee/)).toBeNull());
  });
  it("the Tour Book chapter lists status and the last note of a resolved thread as a decision", async () => {
    mount(); await ready();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: /City notes for Home/ }));
    fireEvent.change(await screen.findByLabelText("Add a note"), { target: { value: "Decision: first stop" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark resolved/ }));
    const team = await screen.findByTestId("chapter-team");
    await waitFor(() => expect(within(team).getByText("Decision: first stop")).toBeTruthy());
    expect(within(team).getByText(/Confirmed/)).toBeTruthy();
  });
});

describe("activity and sync", () => {
  it("lists the last 50 events newest first", async () => {
    mount(); await ready();
    const doc = [...be.docs.values()][0]!;
    be.put({ ...doc, rev: 99, activity: Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, type: "message" as const, key: cityThread(CITY), text: `note ${i}`, name: "Ana", role: "Promoter" as const, at: Date.now() - i * 1000 })) });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    fireEvent.click(screen.getByRole("button", { name: "Team activity" }));
    const list = await screen.findByRole("list", { name: "Team activity" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(50));
    expect(within(list).getAllByRole("listitem")[0]!.textContent).toContain("note 0");
  });
  it("polls every 10 s while the tab is visible and not while hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    const ws = /ws=(\w+)/.exec(where())![1]!;
    const gets = () => be.calls.filter((c) => c.method === "GET" && c.path === `/${ws}`).length;
    const before = gets();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_100); });
    expect(gets()).toBe(before + 1);
    const orig = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(gets()).toBe(before + 1);
    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (orig) Object.defineProperty(Document.prototype, "visibilityState", orig);
  });
  it("shows a teammate's change after the next poll (last write wins)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    const doc = [...be.docs.values()][0]!;
    be.put({ ...doc, rev: doc.rev + 1, statuses: { ...doc.statuses, [CITY]: { status: "dropped", name: "Ana", role: "Promoter", at: Date.now() } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_100); });
    await waitFor(() => expect(screen.getAllByTestId("status-chip").some((c) => /Dropped/.test(c.textContent ?? ""))).toBe(true));
  });
  it("shows a short error and restores the server state when a write fails", async () => {
    mount(); await ready();
    const real = be.fetchImpl.getMockImplementation()!;
    be.fetchImpl.mockImplementation(async (i, init) => (String(i).endsWith("/message") ? new Response(JSON.stringify({ error: "Too many changes, slow down a moment" }), { status: 429, headers: { "content-type": "application/json" } }) : real(i, init)));
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    fireEvent.change(await screen.findByLabelText("Add a note"), { target: { value: "will fail" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many changes/);
    await waitFor(() => expect(screen.queryAllByRole("listitem").some((li) => /will fail/.test(li.textContent ?? ""))).toBe(false));
  });
  it("creates a workspace on the first write of a live tour (no seed)", async () => {
    mount("/tours/board");
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(be.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    fireEvent.change(await screen.findByLabelText("Add a note"), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    expect(be.calls[0]).toMatchObject({ method: "POST", path: "" });
    expect(be.calls[0]!.body).toEqual({});
  });
  it("the share button copies the link with ws", async () => {
    const writeText = vi.fn(async (..._a: string[]) => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Share with your team" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]![0])).toMatch(/ws=testws\d+/);
    expect(await screen.findByText(/Link copied/)).toBeTruthy();
  });
});
