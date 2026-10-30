// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Claim, PlaybookCard as Card } from "@/lib/qloo/types";
import { CardBody } from "./cardBody";
import { ClaimsAudit } from "./ClaimsAudit";
import { metaLine } from "./format";
import { PlaybookCard } from "./PlaybookCard";

afterEach(cleanup);

const card = (kind: Card["kind"], items: Card["items"]): Card => ({ kind, status: "ok", items, refs: [], warnings: [] });
const coBill = (name: string) => ({ name, sharedTaste: 0.5, localAffinity: 0.4, lift: 0.2, sharedTags: [] });
const claim = (text: string): Claim => ({ text, entities: [], numbers: [], evidence_refs: [] });
const NOTE = "1 act hidden by our do-not-book list";

describe("do-not-book at display time (synthetic fixtures)", () => {
  it("co-billing hides the act, shows the note once, and counts shown acts", () => {
    const c = card("co_billing", [coBill("Ariel Pink"), coBill("Synthetic Artist 02"), coBill("Synthetic Artist 03")]);
    const { container } = render(<CardBody card={c} city="Testville" />);
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(screen.getByText("Synthetic Artist 02")).toBeTruthy();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(metaLine("TV", "co_billing", c)).toBe("TV · CO-BILLING · 2 ACTS");
  });
  it("local moment hides an artist but keeps a place of the same name; local acts too", () => {
    const lm = card("local_moment", [{ name: "Ariel Pink", category: "artist" }, { name: "Synthetic Place 01", category: "place" }]);
    const { container, rerender } = render(<CardBody card={lm} city="Testville" />);
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(metaLine("TV", "local_moment", lm)).toBe("TV · PLACES, FILMS AND TV THESE FANS LOVE · 1 PICKS");
    rerender(<CardBody card={card("talent", [{ name: "Ariel Pink", source: "suggested", affinity: 0.5 }, { name: "Synthetic Artist 09", source: "city_popular", affinity: 0.4 }])} city="Testville" />);
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
  });
  it("shows no note when nothing was hidden", () => {
    render(<CardBody card={card("co_billing", [coBill("Synthetic Artist 02")])} city="Testville" />);
    expect(screen.queryByText(/do-not-book/)).toBeNull();
  });
  it("a card whose only act is hidden shows just the note", () => {
    const { container } = render(<CardBody card={card("co_billing", [coBill("Ariel Pink")])} city="Testville" />);
    expect(container.textContent).toBe(NOTE);
  });
  it("hides verified claims and removed claims that name the act", () => {
    const claims = { verified: [claim("Ariel Pink is a strong fit."), claim("Synthetic Artist 02 is a fit.")], removed: [{ claim: claim("Ariel Pink drew 9000."), reason: "no_refs" as const, detail: "" }] };
    const { container } = render(<PlaybookCard accent="#fff" meta="m" title="Co-billing" claims={claims} narrativeStatus="ok" refsCount={0} hasEvidence><p>b</p></PlaybookCard>);
    expect(container.textContent).not.toContain("Ariel Pink");
    expect(screen.getByText("Synthetic Artist 02 is a fit.")).toBeTruthy();
    cleanup();
    const audit = render(<ClaimsAudit claims={[{ card: "Co-billing", removed: claims.removed }]} />);
    expect(audit.container.textContent).not.toContain("Ariel Pink");
  });
});
