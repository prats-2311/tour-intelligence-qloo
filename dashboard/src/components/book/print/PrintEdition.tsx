import { useMemo, type ReactNode } from "react";
import "./print.css";
import { heroWhys } from "@/components/playbook/heroWhy";
import { CARD_TITLE, coBillLine, dealLine, fanRankLine, fit, pct, rankLine, removalText, SPONSORS_NOT_MAINSTREAM_NOTE } from "@/components/playbook/format";
import { STATUS_LABEL, type Field } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";
import { CLOCK_RULE, verdictClocks } from "@/lib/qloo/clocks";
import { applyDoNotBook, HIDDEN_NOTE, visibleClaims } from "@/lib/qloo/doNotBook";
import { firstOkName } from "@/lib/qloo/playbookFacts";
import { countryLabel, INTEGRITY_LINE, statusPlain, VERDICT_LABEL } from "@/lib/qloo/labels";
import { swatchFor } from "@/lib/qloo/merchColor";
import { NUMBER_KEY } from "@/lib/qloo/numberKey";
import { editionLabel, fmtDay, pageRules, scoreText, VERDICT_GLYPH, windowText } from "@/lib/qloo/printEdition";
import { AGE_BANDS, BAND_LABEL } from "@/lib/qloo/segments";
import { segmentKey, useSegments } from "@/lib/qloo/segmentStore";
import { provenanceLine } from "@/lib/qloo/callSummary";
import { zoneDisplayLabel } from "@/lib/qloo/zones";
import { HIDDEN_ORGS_NOTE } from "@/lib/qloo/nonSponsors";
import type { BookCityChapter, TourBook } from "@/lib/qloo/tourBook";
import type { CardClaims, CardKind, DateWindow, PlaybookCard, Verdict } from "@/lib/qloo/types";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const SECTION_ORDER: CardKind[] = ["sponsors", "promo_zones", "venue_fit", "talent", "co_billing", "local_moment", "merch"];

function Glyph({ v }: { v: Verdict }) { return <span className="pe-glyph" aria-hidden>{VERDICT_GLYPH[v]}</span>; }
function VerdictMark({ v }: { v: Verdict }) { return <span className="pe-verdict"><Glyph v={v} />{VERDICT_LABEL[v]}</span>; }

function Section({ kind, title, children, className = "" }: { kind: string; title: string; children: ReactNode; className?: string }) {
  return <section data-section={kind} className={`pe-sec ${className}`}><h3>{title}</h3>{children}</section>;
}
const Note = ({ children }: { children: ReactNode }) => <p className="pe-note">{children}</p>;
const Bar = ({ label, value }: { label: string; value: number | null }) => (
  <div className="pe-bar"><span>{label}</span><span className="pe-track" aria-hidden><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></span><b>{scoreText(value)}</b></div>
);

function Narrative({ claims, card }: { claims?: CardClaims; card?: PlaybookCard }) {
  if (!claims) return null;
  if (claims.verified.length === 0) return card?.status === "ok" ? <Note>Narrative removed: no claim passed verification.</Note> : null;
  return <p className="pe-claim">{claims.verified.map((c) => c.text).join(" ")}</p>;
}

function ageHeadline(data: ReturnType<typeof useSegments>): string | null {
  if (data.status !== "done" || data.data.status !== "ok") return null;
  const ok = data.data.bands.filter((b) => b.status === "ok");
  const top = [...ok].sort((a, b) => b.index - a.index)[0];
  if (!top || !AGE_BANDS.includes(top.band)) return null;
  return `${BAND_LABEL[top.band]} skews highest (${top.index >= 0 ? "+" : ""}${top.index.toFixed(2)} vs average audience)`;
}

function CityPrint({ chapter, n, artistId, window, stops }: { chapter: BookCityChapter; n: number; artistId?: string; window?: DateWindow; stops: number }) {
  const { city, playbook, week } = chapter;
  const ws = useWorkspace();
  const snap = ws.enabled ? ws.snapshot : null;
  const segs = useSegments(artistId ? segmentKey(artistId, city) : null);
  const cards = playbook?.cards ?? [];
  const narrative = playbook?.narrative;
  const ok = chapter.status === "ready";
  const claimsOf = (k: CardKind) => (narrative?.status === "ok" ? visibleClaims(narrative.cards[k]) : undefined);
  const merch = narrative?.status === "ok" ? narrative.merch : null;
  const why = heroWhys(cards);
  const clocks = verdictClocks(window);
  const card = (k: CardKind) => cards.find((c) => c.kind === k);
  const shown = (k: CardKind) => { const c = card(k); return c ? applyDoNotBook(c) : null; };
  const override = (f: Field) => snap?.overrides[city.id]?.[f];
  const fact = (label: string, field: Field | null, qloo: string | null, whyText?: string) => {
    const o = field ? override(field) : undefined;
    if (!o && qloo === null) return null;
    return (
      <div className="pe-fact" key={label}>
        <dt>{label}</dt>
        <dd>
          {o ? <><b>{o.value}</b><small>Team value · {o.name}{o.reason ? `, ${o.reason}` : ""}</small><small>Qloo suggested: {qloo ?? o.original ?? "—"}{whyText ? `, ${whyText}` : ""}</small></> : <><b>{qloo}</b>{whyText && <small>{whyText}</small>}</>}
        </dd>
      </div>
    );
  };
  const zone = firstOkName(cards, "promo_zones", "label");
  const room = firstOkName(cards, "venue_fit", "name");
  const support = firstOkName(cards, "co_billing", "name");
  const topSponsor = firstOkName(cards, "sponsors", "name");
  const age = ageHeadline(segs);
  const status = snap?.statuses[city.id];
  const decisions = snap ? Object.entries(snap.threads).filter(([k, t]) => t.resolved && t.messages.length > 0 && (k === `city:${city.id}` || k.startsWith(`card:${city.id}:`))).map(([k, t]) => ({ key: k, where: k.startsWith("card:") ? CARD_TITLE[k.split(":")[2] as keyof typeof CARD_TITLE] ?? k.split(":")[2]!.replace(/_/g, " ") : "City", last: t.messages[t.messages.length - 1]! })) : [];
  const leads = snap?.leads[city.id] ?? [];
  const removed = narrative?.status === "ok" ? SECTION_ORDER.flatMap((k) => (claimsOf(k)?.removed ?? []).map((r) => ({ kind: k, ...r }))) : [];

  const sponsors = shown("sponsors");
  const sItems = sponsors?.card.items ?? [];
  const rankedAll = sItems.filter((it) => num(it.artistRank) !== null);
  const allOffChart = rankedAll.length > 0 && rankedAll.every((it) => num(it.cityRank) === null);
  const topRanked = sItems.slice(0, 5).find((it) => num(it.artistRank) !== null);
  const deal = topRanked ? dealLine(str(topRanked.name), num(topRanked.artistRank)!, num(topRanked.cityRank), city.name, room ?? undefined) : null;

  const zones = [...(shown("promo_zones")?.card.items ?? [])].sort((a, b) => (num(b.share) ?? 0) - (num(a.share) ?? 0)).slice(0, 5);
  const top3 = zones.slice(0, 3).reduce((s, it) => s + (num(it.share) ?? 0), 0);
  const venues = (shown("venue_fit")?.card.items ?? []).slice(0, 3);
  const talent = shown("talent");
  const coBill = shown("co_billing");
  const moments = shown("local_moment");
  const tagsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && t !== "") : []);
  const sectionEmpty = (label: string) => <Note>Qloo returned no {label} for {city.name}.</Note>;
  const none = (k: CardKind) => !card(k) || card(k)!.status === "empty" || (shown(k)?.card.items.length ?? 0) === 0;

  return (
    <article id={`print-${city.id}`} className={`pe-chapter pe-p-${n}`} aria-labelledby={`print-title-${city.id}`}>
      <header className="pe-chead">
        <div>
          <p className="pe-kicker">Chapter {n} of {stops} · {countryLabel(city.country)}</p>
          <h2 id={`print-title-${city.id}`}>{city.name}</h2>
          <p className="pe-verdictline"><VerdictMark v={city.verdict} />{status && <span className="pe-status"> · Team status: {STATUS_LABEL[status.status]}</span>}</p>
        </div>
        <div className="pe-score"><b>{scoreText(city.winnability.value)}</b><span>/100</span><small>Winnability</small></div>
      </header>
      <div className="pe-bars"><Bar label="Fan heat" value={city.fanHeat.value} /><Bar label="Activation" value={city.activation.value} /></div>
      {!ok ? <Note>Playbook incomplete: {chapter.incompleteReason ?? "Not loaded"}.</Note> : (
        <>
          <dl data-facts="key" className="pe-facts">
            {fact("Top zone", "top_zone", zone ? zoneDisplayLabel(zone, city.name) : null, why.top_zone?.text)}
            {fact("Best room", "best_room", room, why.best_room?.text)}
            {fact("Support", "support", support, why.support?.text)}
            {topSponsor && <div className="pe-fact"><dt>Top sponsor</dt><dd><b>{topSponsor}</b>{topRanked && str(topRanked.name) === topSponsor && num(topRanked.artistRank) !== null && <small>{allOffChart ? fanRankLine(num(topRanked.artistRank)!) : rankLine(num(topRanked.artistRank)!, num(topRanked.cityRank))}</small>}</dd></div>}
            {age && <div className="pe-fact"><dt>Age groups</dt><dd><b>{age.split(" skews")[0]}</b><small>{age.slice(age.indexOf("skews"))}</small></dd></div>}
            {clocks && <div className="pe-fact pe-wide"><dt>Dates</dt><dd><b>{fmtDay(clocks.onSale.date)} on-sale</b><small>Posters by {fmtDay(clocks.postersBy.date)} · confirm sponsor by {fmtDay(clocks.confirmSponsor.date)}</small></dd></div>}
          </dl>
          {narrative?.status === "unavailable" && <Note>{narrative.message}</Note>}

          <Section kind="sponsors" title="Sponsors">
            <Narrative claims={claimsOf("sponsors")} card={card("sponsors")} />
            {none("sponsors") ? sectionEmpty("sponsors") : (
              <ol className="pe-rank pe-cols">
                {sItems.map((it, i) => {
                  const a = num(it.artistRank);
                  return <li key={i}><span>{str(it.name)}</span><em>{a === null ? `Affinity ${fit(num(it.affinity))}` : allOffChart ? fanRankLine(a) : rankLine(a, num(it.cityRank))}</em></li>;
                })}
              </ol>
            )}
            {allOffChart && <Note>{SPONSORS_NOT_MAINSTREAM_NOTE}</Note>}
            {deal && <p className="pe-ask">{deal}</p>}
            {(sponsors?.hidden ?? 0) > 0 && <Note>{HIDDEN_NOTE(sponsors!.hidden)}</Note>}
            {(sponsors?.hiddenOrgs ?? 0) > 0 && <Note>{HIDDEN_ORGS_NOTE(sponsors!.hiddenOrgs)}</Note>}
          </Section>

          <div className="pe-pair">
            <Section kind="promo_zones" title="Promo zones">
              <Narrative claims={claimsOf("promo_zones")} card={card("promo_zones")} />
              {zones.length === 0 ? sectionEmpty("neighbourhood data") : (
                <>
                  <p className="pe-lead">Top 3 hold {Math.round(top3 * 100)}% of in-city heat</p>
                  <table className="pe-table"><thead><tr><th scope="col">Zone</th><th scope="col" className="r">Share</th></tr></thead>
                    <tbody>{zones.map((z, i) => <tr key={i}><td>{zoneDisplayLabel(str(z.label), city.name)}</td><td className="r">{pct(num(z.share) ?? 0)}</td></tr>)}</tbody></table>
                </>
              )}
            </Section>
            <Section kind="venue_fit" title="Venue fit">
              <Narrative claims={claimsOf("venue_fit")} card={card("venue_fit")} />
              {venues.length === 0 ? <Note>Qloo lists no music venues in {city.name} for this artist.</Note> : (
                <table className="pe-table"><thead><tr><th scope="col">Room</th><th scope="col" className="r">Fit</th></tr></thead>
                  <tbody>{venues.map((v, i) => <tr key={i}><td>{str(v.name)}</td><td className="r">{fit(num(v.affinity))}</td></tr>)}</tbody></table>
              )}
            </Section>
          </div>

          <div className="pe-pair">
          <Section kind="talent" title="Acts these fans love here">
            <Narrative claims={claimsOf("talent")} card={card("talent")} />
            {none("talent") ? sectionEmpty("acts") : (
              <>
                {typeof card("talent")?.summary?.sharedTaste === "number" && <p className="pe-lead">Shared taste with {city.name}'s mainstream: {fit(card("talent")!.summary!.sharedTaste)}</p>}
                <ol className="pe-rank">{talent!.card.items.map((it, i) => <li key={i}><span>{str(it.name)}</span><em>{card("talent")?.summary?.rankUnavailable === true ? "" : fit(num(it.affinity))}</em></li>)}</ol>
                <Note>Not all are from the city: check before billing as a local guest.</Note>
              </>
            )}
          </Section>
            <Section kind="co_billing" title="Support-act fit">
              <Narrative claims={claimsOf("co_billing")} card={card("co_billing")} />
              {none("co_billing") ? sectionEmpty("support acts") : (
                <ol className="pe-rank">{coBill!.card.items.map((it, i) => { const s = num(it.sharedTaste), a = num(it.localAffinity); return <li key={i}><span>{str(it.name)}{tagsOf(it.sharedTags).length > 0 && <small> {tagsOf(it.sharedTags).slice(0, 3).join(" · ")}</small>}</span><em>{s !== null && a !== null ? coBillLine(s, a) : ""}</em></li>; })}</ol>
              )}
            </Section>
          </div>
          <div className="pe-pair">
            <Section kind="local_moment" title="Places, films and TV">
              <Narrative claims={claimsOf("local_moment")} card={card("local_moment")} />
              {none("local_moment") ? sectionEmpty("fan picks") : (
                <ol className="pe-rank">{moments!.card.items.map((it, i) => { const a = num(it.artistRank); const t = ({ artist: "Artist", place: "Place", movie: "Film", tv_show: "TV" } as Record<string, string>)[str(it.category)]; return <li key={i}><span>{str(it.name)}{t && <small> {t}</small>}</span><em>{a === null ? fit(num(it.affinity)) : rankLine(a, num(it.cityRank))}</em></li>; })}</ol>
              )}
            </Section>
          {card("merch") && (
              <Section kind="merch" title="Merch brief">
                {merch ? (
                  <>
                    <p className="pe-lead">{merch.title}</p>
                    <Note>Creative direction: model suggestion, not Qloo data.</Note>
                    <p className="pe-palette">{merch.palette.map((p) => { const c = swatchFor(p); return <span key={p}>{c && <i data-print-keep style={{ backgroundColor: c }} aria-hidden />}{p}</span>; })}</p>
                    <div className="pe-two"><div><h4>Motifs</h4><ul>{merch.motifs.map((m) => <li key={m}>{m}</li>)}</ul></div><div><h4>Products</h4><ul>{merch.products.map((m) => <li key={m}>{m}</li>)}</ul></div></div>
                  </>
                ) : none("merch") ? sectionEmpty("merch tags") : (
                  <p>{card("merch")!.items.slice(0, 4).map((it) => `${str(it.name)} ${fit(num(it.affinity))}`).join(" · ")}</p>
                )}
              </Section>
            )}
          </div>

          {week && week.status === "ok" && week.summarised && week.items.length > 0 && (
            <Section kind="this_week" title="This week">
              <ul className="pe-plain">{week.items.map((it, i) => <li key={i}>{it.date && <b>{fmtDay(it.date)} </b>}{it.text}</li>)}</ul>
            </Section>
          )}

          {(decisions.length > 0 || leads.length > 0) && (
            <Section kind="team" title="Team decisions and sponsor leads">
              {decisions.length > 0 && <ul className="pe-plain">{decisions.map((d) => <li key={d.key}><b>{d.where}:</b> {d.last.text} <small>{d.last.name} ({d.last.role})</small></li>)}</ul>}
              {leads.length > 0 && <><h4>Sponsor leads, added by the team</h4><ul className="pe-plain">{leads.map((l) => <li key={l.id}>{l.text} <small>{l.name}</small></li>)}</ul></>}
            </Section>
          )}

          {chapter.claims && (
            <Section kind="claims" title="Claims check" className="pe-claims">
              <p className="pe-lead">{chapter.claims.verified} verified · {chapter.claims.removed} removed <small>Each sentence was checked against the Qloo results it cites.</small></p>
              {removed.length > 0 && <ul className="pe-plain">{removed.map((r, i) => <li key={i}><s>{r.claim.text}</s> <small>{CARD_TITLE[r.kind]}: {removalText(r)}</small></li>)}</ul>}
            </Section>
          )}
        </>
      )}
    </article>
  );
}

function Slope({ rows, held }: { rows: TourBook["market"]["slope"]; held: Set<string> }) {
  const n = Math.max(rows.length, 1), W = 480, STEP = 21, TOP = 26, L = 200, R = 280;
  const y = (r: number) => TOP + (r - 1) * STEP + STEP / 2;
  const H = TOP + n * STEP + 6;
  const ordered = [...rows].sort((a, b) => Number(a.highlight) - Number(b.highlight));
  return (
    <svg role="img" viewBox={`0 0 ${W} ${H}`} className="pe-slope" aria-label="Density-only rank against winnability rank">
      <text x={L} y={14} textAnchor="end" className="h">Density-only rank</text>
      <text x={R} y={14} textAnchor="start" className="h">Winnability rank</text>
      {ordered.map((r) => <line key={r.id} x1={L + 8} y1={y(r.densityRank)} x2={R - 8} y2={y(r.winRank)} stroke={r.highlight ? "#b88700" : held.has(r.id) ? "#151515" : "#b4b4b4"} strokeWidth={r.highlight ? 2.2 : held.has(r.id) ? 1.6 : 0.8} />)}
      {[...rows].sort((a, b) => a.densityRank - b.densityRank).map((r) => <text key={`l${r.id}`} x={L} y={y(r.densityRank) + 3} textAnchor="end" fontWeight={r.highlight || held.has(r.id) ? 700 : 400}>{`${r.name}  ${r.densityRank}`}</text>)}
      {[...rows].sort((a, b) => a.winRank - b.winRank).map((r) => <text key={`r${r.id}`} x={R} y={y(r.winRank) + 3} textAnchor="start" fontWeight={r.highlight || held.has(r.id) ? 700 : 400}>{`${r.winRank}  ${r.name}`}</text>)}
    </svg>
  );
}

export function PrintEdition({ book, artist, artistId, regions, window, now, recordedAt, totalChapters }: { book: TourBook; /** City chapters on the tour; when more than the book holds, the contents say how many are included. */ totalChapters?: number; artist: string; artistId?: string; regions: string[]; window?: DateWindow; now: Date; recordedAt: string | null }) {
  const label = editionLabel(book.source, recordedAt);
  const footer = `Tour Intelligence × Qloo · ${label}`;
  const chapters = book.chapters;
  const sample = book.source !== "live";
  const css = useMemo(() => pageRules([
    { name: "pe-contents", header: "Contents" }, { name: "pe-market", header: `${artist} · Market selection` },
    ...chapters.map((c, i) => ({ name: `pe-city-${i}`, header: `${artist} · ${c.city.name}, ${countryLabel(c.city.country)}` })),
    { name: "pe-proof", header: `${artist} · Proof & method` }, { name: "pe-appendix", header: `${artist} · Appendix` },
  ], footer), [artist, chapters, footer]);
  const rules = [
    ...chapters.map((_, i) => `.pe-p-${i + 1} { page: pe-city-${i}; }`),
  ].join("\n");
  const toc: Array<{ id: string; title: string; sub?: string }> = [
    { id: "print-market", title: "Market selection", sub: `${book.market.rows.length} markets scored, ${chapters.length} held` },
    ...chapters.map((c) => ({ id: `print-${c.city.id}`, title: `${c.city.name}, ${countryLabel(c.city.country)}`, sub: `${VERDICT_LABEL[c.city.verdict]} · ${scoreText(c.city.winnability.value)}/100` })),
    { id: "print-proof", title: "Proof & method", sub: "How to read these numbers, what was checked" },
    { id: "print-appendix", title: "Appendix: every Qloo request", sub: `${book.provenance.length} distinct requests` },
  ];
  return (
    <div className="pe" data-print-edition>
      <style>{css}{"\n"}{rules}</style>

      <section id="print-cover" aria-label="Cover" className="pe-cover">
        <div className="pe-cover-top"><span className="pe-brand">Tour Intelligence <i>×</i> Qloo</span><span className="pe-rule" /></div>
        <div className="pe-cover-mid">
          <p className="pe-kicker">Advance &amp; sponsor book</p>
          <h1>{artist}</h1>
          <p className="pe-scope">{[regions.join(", "), windowText(window)].filter(Boolean).join(" · ")}</p>
          <h2 className="pe-cover-h">{chapters.length} {chapters.length === 1 ? "market held" : "markets held"}</h2>
          <ul className="pe-cover-list">
            {chapters.map((c) => (
              <li key={c.city.id}>
                <span className="n">{c.city.name}<small>{countryLabel(c.city.country)}</small></span>
                <VerdictMark v={c.city.verdict} />
                <b>{scoreText(c.city.winnability.value)}<small>/100</small></b>
              </li>
            ))}
          </ul>
          <p className="pe-cover-key">Winnability: how well the artist's fans line up with what a city can activate, out of 100.</p>
        </div>
        <div className="pe-cover-foot">
          <p>{INTEGRITY_LINE}</p>
          <p>Prepared {fmtDay(now)} · {label}{sample ? "" : ""}</p>
        </div>
      </section>

      <nav id="print-contents" aria-label="Contents" className="pe-contents">
        <h2>Contents</h2>
        {totalChapters !== undefined && totalChapters > chapters.length && <p className="pe-note">{chapters.length} of {totalChapters} city chapters included; the rest were still building.</p>}
        <ol>
          {toc.map((t, i) => <li key={t.id}><a href={`#${t.id}`}><span className="no">{i + 1}</span><span className="t">{t.title}{t.sub && <small>{t.sub}</small>}</span></a></li>)}
        </ol>
        <div className="pe-about">
          <h3>About this book</h3>
          <p>A market-by-market brief for the sponsor or label conversation: where {artist}'s fans are, which cities can be won, and who to ask. Each chapter opens with its key facts, then sponsors and the suggested ask, promo zones, rooms, acts, places and merch.</p>
          <p>Every number comes from Qloo's aggregate taste data and can be traced to the request that produced it (see Proof &amp; method). Wording written by a model was checked sentence by sentence against those results; unsupported sentences were removed.</p>
          {window && <p>{CLOCK_RULE}</p>}
        </div>
      </nav>

      <section id="print-market" aria-labelledby="print-market-title" className="pe-market">
        <p className="pe-kicker">Section 1</p>
        <h2 id="print-market-title">Market selection</h2>
        <p className="pe-lede">Every market Qloo scored for {artist}, ranked by winnability. Held markets are marked and have their own chapter.</p>
        <table className="pe-table pe-wide-table">
          <colgroup><col style={{ width: "30%" }} /><col style={{ width: "17%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "19%" }} /></colgroup>
          <thead><tr><th scope="col">City</th><th scope="col">Country</th><th scope="col" className="r">Fan heat</th><th scope="col" className="r">Activation</th><th scope="col" className="r">Winnability</th><th scope="col">Verdict</th></tr></thead>
          <tbody>
            {book.market.rows.map((c) => (
              <tr key={c.id} className={book.market.shortlisted.has(c.id) ? "held" : undefined}>
                <th scope="row">{c.name}{book.market.shortlisted.has(c.id) && <small> Held</small>}</th><td>{countryLabel(c.country)}</td>
                <td className="r">{scoreText(c.fanHeat.value)}</td><td className="r">{scoreText(c.activation.value)}</td><td className="r">{scoreText(c.winnability.value)}</td>
                <td><VerdictMark v={c.verdict} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <figure className="pe-fig">
          <h3>Density-only vs winnability</h3>
          <Slope rows={book.market.slope} held={book.market.shortlisted} />
          <figcaption>{book.market.slope.some((r) => r.highlight) && <span><i className="k gold" />Hidden goldmine that climbs</span>}<span><i className="k held" />Held markets (bold)</span><span><i className="k" />Other markets</span>{book.market.unplaced.length > 0 && <span>Not scored: Qloo couldn't place {book.market.unplaced.join(", ")}</span>}</figcaption>
        </figure>
        <p className="pe-note">{INTEGRITY_LINE}</p>
      </section>

      {chapters.map((c, i) => <CityPrint key={c.city.id} chapter={c} n={i + 1} artistId={artistId} window={window} stops={chapters.length} />)}

      <section id="print-proof" aria-labelledby="print-proof-title" className="pe-proof">
        <p className="pe-kicker">Proof &amp; method</p>
        <h2 id="print-proof-title">Proof &amp; method</h2>
        <p className="pe-lede">{provenanceLine(book.calls)}.</p>
        <div className="pe-pair">
          <Section kind="key" title="How to read these numbers">
            <dl className="pe-key">{NUMBER_KEY.map((k) => <div key={k.term}><dt>{k.term}</dt><dd>{k.text}</dd></div>)}</dl>
          </Section>
          <Section kind="verdicts" title="Verdict marks">
            <ul className="pe-plain">{(Object.keys(VERDICT_GLYPH) as Verdict[]).filter((v) => v !== "insufficient_data" || book.market.rows.some((r) => r.verdict === v)).map((v) => <li key={v}><VerdictMark v={v} /></li>)}</ul>
            <Note>{INTEGRITY_LINE}</Note>
          </Section>
        </div>
        <Section kind="calls" title="Qloo calls behind each chapter">
          <table className="pe-table"><thead><tr><th scope="col">City</th><th scope="col" className="r">Calls</th><th scope="col">Decided</th></tr></thead>
            <tbody>{book.calls.cities.map((c) => <tr key={c.id}><td>{c.name}</td><td className="r">{c.calls}</td><td>{c.decided.join(", ") || "nothing recorded"}</td></tr>)}</tbody></table>
        </Section>
        <Section kind="claims-total" title="Claims check">
          <table className="pe-table"><thead><tr><th scope="col">City</th><th scope="col" className="r">Verified</th><th scope="col" className="r">Removed</th></tr></thead>
            <tbody>{chapters.filter((c) => c.claims).map((c) => <tr key={c.city.id}><td>{c.city.name}</td><td className="r">{c.claims!.verified}</td><td className="r">{c.claims!.removed}</td></tr>)}</tbody></table>
          <Note>A claim is removed when it names something, or quotes a number, that the Qloo results it cites do not contain.</Note>
        </Section>
      </section>

      <section id="print-appendix" aria-labelledby="print-appendix-title" className="pe-appendix">
        <p className="pe-kicker">Appendix</p>
        <h2 id="print-appendix-title">Every Qloo request</h2>
        <p className="pe-lede">Each distinct request once ({book.provenance.length}); a repeated request is counted above but listed once. Requests marked "live" were not served from the recorded cache.</p>
        <div className="pe-twoup">
          {[book.provenance.slice(0, Math.ceil(book.provenance.length / 2)), book.provenance.slice(Math.ceil(book.provenance.length / 2))].map((half, h) => (
            <table key={h} className="pe-table pe-prov">
              <thead><tr><th scope="col" className="r">#</th><th scope="col">Request</th><th scope="col" className="r">Results</th></tr></thead>
              <tbody>{half.map((r) => <tr key={r.cacheKey}><td className="r">{r.n}</td><td>{r.name}{r.inputs && <small> {r.inputs}</small>}</td><td className="r">{r.status === "ok" ? r.resultCount : `${statusPlain(r.status)}, ${r.resultCount}`}{!r.cached && <small> live</small>}</td></tr>)}</tbody>
            </table>
          ))}
        </div>
      </section>
    </div>
  );
}
