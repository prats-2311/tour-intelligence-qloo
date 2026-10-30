import type { AdvanceHolidays, AdvanceRisks, AdvanceWeather, AdvanceWeb } from "@/lib/qloo/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const mon = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && mon ? `${Number(m[3])} ${mon}` : iso;
};
const LINK = "inline-flex min-h-11 items-center break-words text-[13px] text-canvas-text underline decoration-canvas-muted underline-offset-4 hover:decoration-canvas-text";
const H = "font-title text-[16px] leading-tight text-canvas-text";
const MUTED = "text-[13px] text-canvas-muted";
export const ADVANCE_FOOTER = "Web sources via Tavily; summaries checked against the sources. Weather from Open-Meteo, holidays from Nager.Date. Always confirm with the promoter and immigration counsel.";
export const NATIONALITY_CAVEAT = "Requirements depend on the artist’s nationality.";

const Section = ({ title, label, children }: { title: string; label: string; children: React.ReactNode }) => (
  <section aria-label={label} className="border-t border-canvas-line py-4 first:border-t-0 first:pt-0">
    <h4 className={H}>{title}</h4>
    <div className="mt-2">{children}</div>
  </section>
);
const Skeleton = () => <div data-testid="advance-skeleton" aria-hidden className="space-y-2"><div className="skeleton h-4 w-4/5 rounded-[4px]" /><div className="skeleton h-4 w-3/5 rounded-[4px]" /></div>;
const Src = ({ href, children }: { href: string; children: React.ReactNode }) => <a data-cite href={href} target="_blank" rel="noreferrer" className={LINK}>{children}</a>;

function WeatherBody({ w }: { w: AdvanceWeather }) {
  if (w.status !== "ok") return <p className={MUTED}>{w.message}</p>;
  const pct = Math.round(w.rainDaysShare * 100);
  return (
    <div>
      <p className="text-[15px] leading-[1.45] text-canvas-text tabular-nums">Daytime highs average {w.tempMaxC.mean}°C (range {w.tempMaxC.min} to {w.tempMaxC.max}°C). Nights average {w.tempMinC.mean}°C. About {pct}% of days had rain of 1 mm or more.</p>
      <p className={`mt-1 ${MUTED}`}>{w.note} Based on {w.days} days.</p>
      <Src href={w.sourceUrl}>{w.source}</Src>
    </div>
  );
}

function HolidayBody({ h }: { h: AdvanceHolidays }) {
  if (h.status !== "ok") return <p className={MUTED}>{h.message}</p>;
  return (
    <div>
      {h.items.length === 0 ? <p className="text-[15px] text-canvas-muted">No public holidays in the show window</p> : (
        <ul className="space-y-1">
          {h.items.filter((i, n, all) => all.findIndex((o) => o.date === i.date && o.name === i.name) === n).map((i) => (
            <li key={`${i.date}-${i.name}`} className="text-[15px] leading-[1.45] text-canvas-text">
              <span className="text-[13px] tabular-nums text-canvas-muted">{day(i.date)}</span><span aria-hidden="true" className="mx-1.5 text-canvas-muted">{" \u00b7 "}</span><span>{i.name}</span>
              {i.localName !== i.name && <span className="text-canvas-muted"> ({i.localName})</span>}
              {i.near && <span className="ml-2 text-[13px] text-canvas-muted">Just outside the window</span>}
            </li>
          ))}
        </ul>
      )}
      <Src href={h.sourceUrl}>{h.source}</Src>
    </div>
  );
}

function WebBody({ s, nationality }: { s: AdvanceWeb; nationality?: boolean }) {
  const sources = s.sources ?? [];
  const links = sources.length > 0 && (
    <ul className="mt-1 flex flex-wrap gap-x-4">{sources.map((x) => <li key={x.url}><Src href={x.url}>{x.title}</Src></li>)}</ul>
  );
  if (s.status !== "ok") return <div><p className={MUTED}>{s.message}</p>{s.status === "unavailable" && links}</div>;
  return (
    <div>
      {s.summary && s.summary !== NATIONALITY_CAVEAT && <p className="text-[15px] leading-[1.45] text-canvas-text">{s.summary}</p>}
      {s.leadTime && <p className="mt-1 text-[15px] text-canvas-text"><span className={MUTED}>Lead time </span>{s.leadTime}</p>}
      <ul className="mt-1">
        {s.items.map((i) => (
          <li key={i.sourceUrl + i.text} className="py-1.5">
            <p className="text-[15px] leading-[1.45] text-canvas-text">{i.text}</p>
            <Src href={i.sourceUrl}>Source</Src>
          </li>
        ))}
      </ul>
      {nationality && !s.artistCountry && <p className={`mt-1 ${MUTED}`}>{NATIONALITY_CAVEAT}</p>}
      {s.artistCountry && <p className={`mt-1 ${MUTED}`}>For an artist from {s.artistCountry}.</p>}
      {links}
    </div>
  );
}

/** Advance & risks body: one block per lookup, each with its own loading, unavailable and capped states. */
export function AdvanceBody({ data, loading, message }: { data: AdvanceRisks | undefined; loading: boolean; message?: string }) {
  if (message) return <p className={MUTED}>{message}</p>;
  const wait = loading || !data;
  return (
    <div>
      <Section title="Weather" label="Weather">{wait ? <Skeleton /> : <WeatherBody w={data.weather} />}</Section>
      <Section title="Holidays in the window" label="Holidays">{wait ? <Skeleton /> : <HolidayBody h={data.holidays} />}</Section>
      <Section title="Visas & work permits" label="Visas and work permits">{wait ? <Skeleton /> : <WebBody s={data.visa} nationality />}</Section>
      <Section title="Equipment & customs" label="Equipment and customs">{wait ? <Skeleton /> : <WebBody s={data.equipment} />}</Section>
      <p className={`border-t border-canvas-line pt-3 ${MUTED}`}>{ADVANCE_FOOTER}</p>
    </div>
  );
}
