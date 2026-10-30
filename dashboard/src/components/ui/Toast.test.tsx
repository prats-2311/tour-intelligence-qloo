// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, TOAST_MS, TOAST_MAX } from "./Toast";

let api: ReturnType<typeof useToast>;
function Grab() { api = useToast(); return null; }
const setup = () => render(<ToastProvider><Grab /></ToastProvider>);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("toast system", () => {
  it("announces a message politely with role=status and aria-live=polite", () => {
    setup();
    act(() => { api.toast({ message: "Link copied." }); });
    const t = screen.getByRole("status");
    expect(t.textContent).toContain("Link copied.");
    expect(t.getAttribute("aria-live")).toBe("polite");
  });
  it("announces errors with role=alert", () => {
    setup();
    act(() => { api.toast({ message: "Could not copy", tone: "error" }); });
    expect(screen.getByRole("alert").textContent).toContain("Could not copy");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("renders selectable text in a read-only field", () => {
    setup();
    act(() => { api.toast({ message: "Copy this link", tone: "error", selectable: "https://x.test/?ws=1" }); });
    const input = screen.getByLabelText("Text to copy") as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe("https://x.test/?ws=1");
  });
  it("auto-dismisses after 5 seconds", () => {
    setup();
    expect(TOAST_MS).toBe(5000);
    act(() => { api.toast({ message: "Saved" }); });
    act(() => { vi.advanceTimersByTime(4900); });
    expect(screen.queryByText("Saved")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Saved")).toBeNull();
  });
  it("pauses on hover and resumes with the time left", () => {
    setup();
    act(() => { api.toast({ message: "Saved" }); });
    const t = screen.getByRole("status");
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.mouseEnter(t);
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.queryByText("Saved")).not.toBeNull();
    fireEvent.mouseLeave(t);
    act(() => { vi.advanceTimersByTime(1900); });
    expect(screen.queryByText("Saved")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("Saved")).toBeNull();
  });
  it("pauses while focus is inside the toast", () => {
    setup();
    act(() => { api.toast({ message: "Saved" }); });
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    act(() => { close.focus(); });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.queryByText("Saved")).not.toBeNull();
    fireEvent.blur(close);
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText("Saved")).toBeNull();
  });
  it("closes from the close button, which is a 44px target", () => {
    setup();
    act(() => { api.toast({ message: "Saved" }); });
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    expect(close.className).toMatch(/min-h-11/);
    expect(close.className).toMatch(/min-w-11/);
    fireEvent.click(close);
    expect(screen.queryByText("Saved")).toBeNull();
  });
  it("stacks at most 3, dropping the oldest", () => {
    setup();
    expect(TOAST_MAX).toBe(3);
    act(() => { for (const m of ["one", "two", "three", "four"]) api.toast({ message: m }); });
    expect(screen.queryByText("one")).toBeNull();
    for (const m of ["two", "three", "four"]) expect(screen.queryByText(m)).not.toBeNull();
  });
  it("sits fixed at the bottom centre above the mobile bar and never takes part in layout", () => {
    setup();
    act(() => { api.toast({ message: "Saved" }); });
    const vp = document.querySelector("[data-toast-viewport]") as HTMLElement;
    expect(vp.className).toMatch(/fixed/);
    expect(vp.className).toMatch(/left-1\/2/);
    expect(vp.className).toMatch(/-translate-x-1\/2/);
    expect(vp.className).toMatch(/bottom-\[calc\(5rem/);
    expect(vp.className).toMatch(/pointer-events-none/);
  });
  it("animates only when motion is allowed", () => {
    setup();
    act(() => { api.toast({ message: "Saved" }); });
    expect(screen.getByRole("status").className).toMatch(/motion-safe:/);
    expect(screen.getByRole("status").className).not.toMatch(/(^|\s)animate-/);
  });
  it("is a harmless no-op without a provider", () => {
    function Bare() { const { toast } = useToast(); toast({ message: "x" }); return <p>ok</p>; }
    render(<Bare />);
    expect(screen.getByText("ok")).toBeTruthy();
  });
});
