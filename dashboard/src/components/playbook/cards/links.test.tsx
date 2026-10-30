// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlaybookCard } from "@/lib/qloo/types";
import { CardBody } from "../cardBody";

afterEach(cleanup);
const card = (kind: PlaybookCard["kind"], items: PlaybookCard["items"]): PlaybookCard => ({ kind, status: "ok", refs: [], warnings: [], items }) as PlaybookCard;
const M = "https://www.google.com/maps/search/?api=1&query=";

describe("outbound links on rows", () => {
  it("venue rows link to Google Maps with city and country, opening safely in a new tab", () => {
    render(<CardBody card={card("venue_fit", [{ name: "Foro Sol", affinity: 0.8 }])} city="Mexico City" country="MX" />);
    const a = screen.getByRole("link", { name: "Open Foro Sol in Google Maps (new tab)" });
    expect(a.getAttribute("href")).toBe(`${M}Foro%20Sol%2C%20Mexico%20City%2C%20MX`);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.hasAttribute("data-noprint")).toBe(true);
  });
  it("local moment links only place rows", () => {
    const items = [
      { name: "Cine Foro", category: "place", affinity: 0.7 },
      { name: "Plaza Viva", type: "urn:entity:place", affinity: 0.6 },
      { name: "Bruma Nocturna", category: "artist", affinity: 0.9 },
      { name: "Noche Larga", category: "movie", affinity: 0.5 },
      { name: "Serie Uno", category: "tv_show", affinity: 0.4 },
    ];
    render(<CardBody card={card("local_moment", items)} city="Ciudad Juárez" country="MX" />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open Cine Foro in Google Maps (new tab)" }).getAttribute("href")).toBe(`${M}Cine%20Foro%2C%20Ciudad%20Ju%C3%A1rez%2C%20MX`);
    expect(screen.getByRole("link", { name: "Open Plaza Viva in Google Maps (new tab)" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Bruma|Noche|Serie/ })).toBeNull();
  });
  it("promo zones link each named zone", () => {
    render(<CardBody card={card("promo_zones", [{ label: "Hollywood", share: 0.2 }])} city="Los Angeles" country="US" />);
    expect(screen.getByRole("link", { name: "Open Hollywood in Google Maps (new tab)" }).getAttribute("href")).toBe(`${M}Hollywood%2C%20Los%20Angeles%2C%20US`);
  });
  it("talent and co-billing acts link to a Spotify search; sponsors get none", () => {
    render(<CardBody card={card("talent", [{ name: "Bruma & Co", affinity: 0.5, source: "suggested" }])} city="Lima" />);
    const listen = screen.getByRole("link", { name: "Listen to Bruma & Co on Spotify (new tab)" });
    // WCAG 2.5.3: the visible words ("Listen") are inside the accessible name; the arrow is decoration.
    expect(listen.getAttribute("aria-label")).toContain("Listen");
    expect(listen.querySelector("[aria-hidden]")?.textContent).toBe("↗");
    expect(listen.getAttribute("href")).toBe("https://open.spotify.com/search/Bruma%20%26%20Co");
    cleanup();
    render(<CardBody card={card("co_billing", [{ name: "Stüssy Sound", sharedTaste: 0.5, localAffinity: 0.5, lift: 1 }])} city="Lima" />);
    expect(screen.getByRole("link", { name: "Listen to Stüssy Sound on Spotify (new tab)" }).getAttribute("href")).toBe("https://open.spotify.com/search/St%C3%BCssy%20Sound");
    cleanup();
    render(<CardBody card={card("sponsors", [{ name: "Cerro Alto Mezcal", category: "brand", affinity: 0.9 }])} city="Lima" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
