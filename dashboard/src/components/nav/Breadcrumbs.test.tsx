// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import synthetic from "@/test/fixtures/showcase.synthetic.json";
import { TourBoardProvider } from "@/lib/qloo/TourBoardProvider";
import { SAMPLE_CITIES } from "@/lib/qloo/fixtures/lumenVale";
import { parseShowcase, setShowcase, showcaseCities, SHOWCASE } from "@/lib/qloo/showcase";
import { Breadcrumbs } from "./Breadcrumbs";

const original = SHOWCASE;
let narrow = false;
beforeEach(() => {
  narrow = false;
  setShowcase(parseShowcase(synthetic));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width") ? narrow : true, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { setShowcase(original); vi.unstubAllGlobals(); });

const mount = (url: string) => render(<MemoryRouter initialEntries={[url]}><TourBoardProvider><Breadcrumbs /></TourBoardProvider></MemoryRouter>);
const trail = () => Array.from(screen.getByRole("navigation", { name: "Breadcrumb" }).querySelectorAll("li")).map((li) => li.textContent?.trim());

describe("Breadcrumbs", () => {
  it("renders nothing on the landing page", () => {
    mount("/");
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });
  it("board: artist from the recording, ordered list, last item is the current page", () => {
    mount("/tours/board?showcase=1");
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.querySelector("ol")).toBeTruthy();
    expect(trail()).toEqual(["Overview", `${SHOWCASE.artist} tour`, "Tour Board"]);
    const last = nav.querySelector("li:last-child [aria-current='page']");
    expect(last?.textContent).toBe("Tour Board");
    expect(nav.querySelectorAll("[aria-current]")).toHaveLength(1);
  });
  it("links keep ?showcase=1 and ?ws=", () => {
    mount("/tours/book?showcase=1&ws=team42");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/?showcase=1&ws=team42", "/tours/board?showcase=1&ws=team42"]);
  });
  it("playbook: city name from the recording, city is text, Tour Board links back", () => {
    const city = showcaseCities().find((c) => synthetic.playbooks[c.id as keyof typeof synthetic.playbooks])!;
    mount(`/tours/playbook/${city.id}?showcase=1`);
    expect(trail()).toEqual(["Overview", `${SHOWCASE.artist} tour`, "Tour Board", city.name, "Playbook"]);
    expect(screen.getByRole("link", { name: "Tour Board" }).getAttribute("href")).toBe("/tours/board?showcase=1");
    expect(screen.queryByRole("link", { name: city.name })).toBeNull();
  });
  it("sample set: artist and city from the Lumen Vale fixture", () => {
    const c = SAMPLE_CITIES[1]!;
    mount(`/tours/playbook/${c.id}?sample=1`);
    expect(trail()[1]).toBe("Lumen Vale tour");
    expect(trail()[3]).toBe(c.name);
  });
  it.each([["/tours/book", "Tour Book"], ["/insights", "Charts"], ["/tours/insights", "Charts"], ["/tours/budget", "Budget"]])("%s ends in %s", (path, last) => {
    mount(`${path}?showcase=1`);
    expect(trail().at(-1)).toBe(last);
  });
  it("proof, agents and v2 have a short trail", () => {
    mount("/v2");
    expect(trail()).toEqual(["Overview", "What's next"]);
  });
  it("on a narrow screen a long trail collapses the middle into a … button that expands it", () => {
    narrow = true;
    const city = showcaseCities()[0]!;
    mount(`/tours/playbook/${city.id}?showcase=1`);
    expect(trail().filter(Boolean)).toEqual(["Overview", "…", "Playbook"]);
    fireEvent.click(screen.getByRole("button", { name: "Show full path" }));
    expect(trail()).toEqual(["Overview", `${SHOWCASE.artist} tour`, "Tour Board", city.name, "Playbook"]);
  });
  it("a short trail is never collapsed on a narrow screen", () => {
    narrow = true;
    mount("/tours/board?showcase=1");
    expect(trail()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Show full path" })).toBeNull();
  });
});
