// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_KEY, type TourListItem } from "@/lib/tours/api";
import MyTours from "./MyTours";

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const NOW = Date.now();
const mk = (o: Partial<TourListItem>): TourListItem => ({
  id: "a", title: "Lumen Vale tour", status: "draft", artist: "Lumen Vale", regions: ["Mexico"],
  cities: [1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), name: `City ${n}`, country: "Mexico" })), createdAt: NOW - 7_200_000, updatedAt: NOW - 7_200_000, runBytes: 100, ...o,
});
let db: TourListItem[];
let calls: Array<{ url: string; method: string; body?: any }>;
let failList = false;
let failDelete: number | null = null;
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
const mount = () => render(<MemoryRouter initialEntries={["/tours/mine"]}><MyTours /><Where /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear(); localStorage.setItem(OWNER_KEY, "tok");
  db = [mk({ id: "a" }), mk({ id: "b", title: "Mara Quill tour", artist: "Mara Quill", status: "final", cities: [{ id: "9", name: "Lima", country: "Peru" }] })];
  calls = []; failList = false; failDelete = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body ? JSON.parse(init.body as string) : undefined });
    if (method === "GET") {
      if (failList) return json({ error: "x" }, 503);
      const u = new URL(url, "http://x");
      const q = (u.searchParams.get("q") ?? "").toLowerCase(), st = u.searchParams.get("status");
      return json({ tours: db.filter((t) => (!q || t.title.toLowerCase().includes(q)) && (!st || t.status === st)) });
    }
    if (method === "DELETE") { if (failDelete) return json({ error: "x" }, failDelete); db = db.filter((t) => url.endsWith(`/${t.id}`) === false); return json(null, 204); }
    if (method === "PATCH") { const id = url.split("/").pop()!; db = db.map((t) => (t.id === id ? { ...t, ...calls.at(-1)!.body } : t)); return json({ id, updatedAt: NOW }); }
    return json({}, 400);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("My tours", () => {
  it("lists saved tours: title, artist, first four city chips and +N, status, relative time", async () => {
    mount();
    const row = (await screen.findByText("Lumen Vale tour")).closest("li")!;
    expect(within(row).getByText("Lumen Vale")).toBeTruthy();
    expect(within(row).getByText("City 4")).toBeTruthy();
    expect(within(row).queryByText("City 5")).toBeNull();
    expect(within(row).getByText("+2")).toBeTruthy();
    expect(within(row).getByText("Draft")).toBeTruthy();
    expect(within(row).getByText("Updated 2 hours ago")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My tours" })).toBeTruthy();
    expect(screen.getByText("2 saved tours").getAttribute("role")).toBe("status");
    expect(screen.getByText("Saved in this browser's private space. Clearing site data removes access.")).toBeTruthy();
  });
  it("search is debounced 250 ms into one GET ?q=", async () => {
    mount();
    await screen.findByText("Lumen Vale tour");
    const box = screen.getByRole("searchbox", { name: "Search saved tours" });
    for (const v of ["m", "ma", "mara"]) fireEvent.change(box, { target: { value: v } });
    expect(calls.filter((c) => c.url.includes("q=")).length).toBe(0);
    await waitFor(() => expect(calls.filter((c) => c.url.includes("q=")).length).toBe(1));
    expect(calls.find((c) => c.url.includes("q="))!.url).toBe("/api/tours?q=mara");
    await waitFor(() => expect(screen.queryByText("Lumen Vale tour")).toBeNull());
    expect(screen.getByText("Mara Quill tour")).toBeTruthy();
  });
  it("status filter asks for drafts or final", async () => {
    mount();
    await screen.findByText("Lumen Vale tour");
    fireEvent.click(screen.getByRole("radio", { name: "Drafts" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/tours?status=draft")).toBe(true));
    await waitFor(() => expect(screen.queryByText("Mara Quill tour")).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "Final" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/tours?status=final")).toBe(true));
  });
  it("Open goes to the board with ?saved=<id>", async () => {
    mount();
    const row = (await screen.findByText("Lumen Vale tour")).closest("li")!;
    fireEvent.click(within(row).getByRole("link", { name: "Open Lumen Vale tour" }));
    expect(screen.getByTestId("where").textContent).toBe("/tours/board?saved=a");
  });
  it("Mark final patches the status and flips the chip and button", async () => {
    mount();
    const row = (await screen.findByText("Lumen Vale tour")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Mark Lumen Vale tour as final" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "final" }));
    await waitFor(() => expect(within(row).getByText("Final")).toBeTruthy());
    expect(within(row).getByRole("button", { name: "Mark Lumen Vale tour as draft" })).toBeTruthy();
  });
  it("Delete asks inline first, then deletes; Cancel keeps it", async () => {
    mount();
    const row = (await screen.findByText("Lumen Vale tour")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete Lumen Vale tour" }));
    expect(within(row).getByText("Delete this tour? This can't be undone.")).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));
    expect(within(row).queryByText("Delete this tour? This can't be undone.")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Delete Lumen Vale tour" }));
    fireEvent.click(within(row).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/tours/a"));
    await waitFor(() => expect(screen.queryByText("Lumen Vale tour")).toBeNull());
    expect(screen.getByText("Mara Quill tour")).toBeTruthy();
  });
  it("a failed delete says so and keeps the row", async () => {
    failDelete = 503;
    mount();
    const row = (await screen.findByText("Lumen Vale tour")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete Lumen Vale tour" }));
    fireEvent.click(within(row).getByRole("button", { name: "Yes, delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain("unavailable");
    expect(screen.getByText("Lumen Vale tour")).toBeTruthy();
  });
  it("empty state points at planning a tour", async () => {
    db = [];
    mount();
    expect(await screen.findByText("No saved tours yet. Plan a tour and it's saved here automatically.")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Plan a tour" }));
    expect(screen.getByTestId("where").textContent).toBe("/tours/board?new=1");
  });
  it("no match for a search says so (not the empty state)", async () => {
    mount();
    await screen.findByText("Lumen Vale tour");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search saved tours" }), { target: { value: "zzz" } });
    expect(await screen.findByText("No saved tours match that search.")).toBeTruthy();
  });
  it("shows a loading state, then an error with a retry", async () => {
    failList = true;
    mount();
    expect(screen.getByText("Loading your tours")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load your saved tours");
    failList = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Lumen Vale tour")).toBeTruthy();
  });
  it("explains when the browser keeps no site data, and asks nothing", async () => {
    localStorage.clear();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    mount();
    expect(await screen.findByText(/Saved tours need this browser to keep site data/)).toBeTruthy();
    expect(calls.length).toBe(0);
  });
});
