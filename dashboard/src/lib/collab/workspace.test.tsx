// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChapterTeam } from "@/components/collab/ChapterTeam";
import { NotesButton } from "@/components/collab/Notes";
import { SponsorLeads } from "@/components/collab/SponsorLeads";
import { CityStatusChip, StatusPicker } from "@/components/collab/Status";
import { TeamBar } from "@/components/collab/TeamBar";
import { ToastProvider } from "@/components/ui/Toast";
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
      <AdvanceSheet cityId={CITY} editable rows={[{ label: "TOP ZONE", value: "Old Quarter", why: { text: "31% of in-city fan heat (#1 of 3 zones)", card: "promo_zones" } }, { label: "CLAIMS", value: "3 verified" }]} />
      <SponsorLeads cityId={CITY} />
      <ChapterTeam cityId={CITY} />
      <Link to="/tours/book?showcase=1">book</Link>
      <span data-testid="enabled">{String(w.enabled)}</span>
      <Where />
    </>
  );
}
function mount(path = "/tours/board?showcase=1") {
  return render(<MemoryRouter initialEntries={[path]}><TourBoardProvider><WorkspaceProvider><ToastProvider><Harness /></ToastProvider></WorkspaceProvider></TourBoardProvider></MemoryRouter>);
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
  it("ignores a malformed ws in the URL: never fetches it, starts a fresh workspace", async () => {
    mount("/tours/board?showcase=1&ws=short");
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    expect(be.calls.some((c) => c.method === "GET" && c.path === "/short")).toBe(false);
    be.calls.length = 0;
    cleanup();
    mount(`/tours/board?showcase=1&ws=${encodeURIComponent("abcde/../../x1")}`);
    await waitFor(() => expect(where()).toMatch(/ws=testws/));
    expect(be.calls.some((c) => c.method === "GET")).toBe(false);
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
  it("keeps the composer as a footer below the thread (never an overlay on the last note), with the thread scrolling above it", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    const box = await screen.findByLabelText("Add a note");
    const composer = box.closest("[data-testid='notes-composer']") as HTMLElement | null;
    expect(composer).not.toBeNull();
    expect(composer!.className).not.toContain("sticky");
    expect(composer!.className).toContain("shrink-0");
    expect(screen.getByRole("list", { name: "Notes" }).className).toContain("overflow-y-auto");
    expect(composer!.className).toContain("bg-paper");
    expect(within(composer!).getByRole("button", { name: "Add note" })).toBeTruthy();
  });
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
  it("asks who is writing inside the notes sheet (one dialog) and returns focus to the composer after Save", async () => {
    localStorage.clear();
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    const box = await screen.findByLabelText("Add a note");
    fireEvent.change(box, { target: { value: "Draft kept" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const name = await screen.findByLabelText("Your name");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(screen.getByRole("dialog")).getByLabelText("Add a note")).toBeTruthy(); // the sheet is still there, with the draft
    expect((screen.getByLabelText("Add a note") as HTMLTextAreaElement).value).toBe("Draft kept");
    fireEvent.change(name, { target: { value: "Rae" } });
    fireEvent.click(screen.getByLabelText("Promoter"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Draft kept")).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByLabelText("Add a note"));
    expect(screen.queryByLabelText("Your name")).toBeNull();
  });
  it("Escape cancels an inline override edit and puts focus back on Edit", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Top zone" }));
    const input = screen.getByLabelText("Team value for Top zone");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Team value for Top zone")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Top zone" }));
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
    expect(screen.getByTestId("qloo-suggested").textContent).toBe("Qloo suggested: Old Quarter — 31% of in-city fan heat (#1 of 3 zones)");
    expect(within(screen.getByTestId("qloo-suggested")).getByRole("link").getAttribute("href")).toBe("#card-promo_zones");
    fireEvent.click(screen.getByRole("button", { name: "Revert to Qloo" }));
    await waitFor(() => expect(screen.queryByTestId("team-value")).toBeNull());
    expect(screen.getByText("Old Quarter")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Support" })).toBeNull(); // only the three tiles are editable
  });
  it("an override can carry a short reason, shown as Team value · name — reason", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Top zone" }));
    const why = screen.getByLabelText("Why? (optional)") as HTMLInputElement;
    expect(why.maxLength).toBe(200);
    fireEvent.change(screen.getByLabelText("Team value for Top zone"), { target: { value: "Harbour" } });
    fireEvent.change(why, { target: { value: "Closer to the venue" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("team-value").textContent).toBe("Harbour"));
    expect(screen.getByTestId("team-line").textContent).toMatch(/^Team value · Sam — Closer to the venue/);
    // no reason, no dash
    fireEvent.click(screen.getByRole("button", { name: "Edit Top zone" }));
    expect((screen.getByLabelText("Why? (optional)") as HTMLInputElement).value).toBe("Closer to the venue");
    fireEvent.change(screen.getByLabelText("Why? (optional)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("team-line").textContent).not.toContain("—"));
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
  it("the share button copies the link with ws and confirms in a toast, not inline", async () => {
    const writeText = vi.fn(async (..._a: string[]) => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    mount(); await ready();
    const bar = screen.getByTestId("team-bar");
    const before = bar.innerHTML;
    fireEvent.click(screen.getByRole("button", { name: "Share with your team" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]![0])).toMatch(/ws=testws\d+/);
    const toast = await toastText();
    expect(toast).toContain("Link copied");
    expect(toast).toContain("Don't post contracts, fees or personal details.");
    expect(bar.innerHTML).toBe(before); // nothing inserted into the header row
    expect(bar.querySelector("[role=status]")).toBeNull();
  });
  it("a clipboard failure is an error toast with the link selectable, and still nothing inline", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    mount(); await ready();
    const bar = screen.getByTestId("team-bar");
    fireEvent.click(screen.getByRole("button", { name: "Share with your team" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Copy this link");
    expect((within(alert).getByLabelText("Text to copy") as HTMLInputElement).value).toMatch(/ws=testws\d+/);
    expect(bar.querySelector("input, [role=alert], [role=status]")).toBeNull();
  });
});

const toastText = async () => (await waitFor(() => { const v = document.querySelector("[data-toast-viewport]"); expect(v?.textContent).toBeTruthy(); return v!; })).textContent ?? "";

describe("saves confirm in toasts", () => {
  it("note posted, resolved and reopened", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /Notes for Sponsors/ }));
    fireEvent.change(await screen.findByLabelText("Add a note"), { target: { value: "Hello team" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(within(document.querySelector("[data-toast-viewport]") as HTMLElement).getByText("Note posted.")).toBeTruthy());
    const dialog = screen.getByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: /Mark resolved/ }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Thread marked resolved."));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Thread reopened."));
  });
  it("status changed", async () => {
    mount(); await ready();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "on_hold" } });
    expect(await toastText()).toContain("Status set to On hold.");
    expect(screen.getByTestId("status-picker").querySelector("[role=status]")).toBeNull();
  });
  it("override saved and reverted", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Top zone" }));
    fireEvent.change(screen.getByLabelText("Team value for Top zone"), { target: { value: "Harbour" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Team value saved."));
    fireEvent.click(await screen.findByRole("button", { name: "Revert to Qloo" }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Back to Qloo's value."));
  });
  it("sponsor lead added and removed", async () => {
    mount(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "+ Add a lead" }));
    fireEvent.change(screen.getByLabelText("Sponsor lead"), { target: { value: "Harbour Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Save lead" }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Sponsor lead added."));
    fireEvent.click(await screen.findByRole("button", { name: "Remove lead Harbour Coffee" }));
    await waitFor(() => expect(document.querySelector("[data-toast-viewport]")!.textContent).toContain("Sponsor lead removed."));
  });
  it("a failed write is an error toast, never a saved one", async () => {
    mount(); await ready();
    const real = be.fetchImpl.getMockImplementation()!;
    be.fetchImpl.mockImplementation(async (i, init) => (String(i).endsWith("/status") ? new Response(JSON.stringify({ error: "nope" }), { status: 500, headers: { "content-type": "application/json" } }) : real(i, init)));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "on_hold" } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save that");
    expect(document.querySelector("[data-toast-viewport]")!.textContent).not.toContain("Status set");
  });
});
