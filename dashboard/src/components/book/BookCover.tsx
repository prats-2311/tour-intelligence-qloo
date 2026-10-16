import { SampleBanner } from "@/components/qloo/SampleBanner";
import { KeyArtPoster } from "@/components/playbook/KeyArtPoster";
import type { BookCityChapter } from "@/lib/qloo/tourBook";

export function BookCover({ artist, regions, season, chapters, sample }: { artist: string; regions: string[]; season: string; chapters: BookCityChapter[]; sample: boolean }) {
  const tiles = chapters.slice(0, 6);
  return (
    <section id="chapter-cover" aria-label="Cover" className="book-chapter flex min-w-0 flex-col gap-4">
      {sample && <SampleBanner />}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-[2px] bg-canvas" aria-hidden>
          {tiles.map((c) => (
            <div key={c.city.id} className="min-w-0 overflow-hidden [&_svg]:rounded-none"><KeyArtPoster city={c.city.name} accent={c.accent} ratio="4:5" /></div>
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1 px-4 lg:px-0">
        <h1 className="font-title break-words text-[32px] leading-[1.1] text-canvas-text">{artist}</h1>
        <p className="text-[15px] text-canvas-text">{[regions.join(", "), season].filter(Boolean).join(" · ")}</p>
        <p className="text-[13px] text-canvas-muted">Don't just find your fans. Win their city.</p>
      </div>
    </section>
  );
}
