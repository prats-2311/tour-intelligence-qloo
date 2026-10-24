import { useId } from "react";

const BONE = "#efe9dc";
const CANVAS = "#1c1b18";

// Deterministic typographic poster (real generated key art is Plan 6). Two inks on canvas: city accent + bone.
/** `decorative` drops the city name (the page already shows it once) and hides the art from assistive tech; "strip" is the short band used on phones. */
export function KeyArtPoster({ city, accent, ratio, decorative = false }: { city: string; accent: string; ratio: "4:5" | "16:9" | "strip"; decorative?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const portrait = ratio === "4:5";
  const strip = ratio === "strip";
  const w = portrait ? 400 : 1600;
  const h = portrait ? 500 : strip ? 260 : 900;
  const words = city.split(" ");
  const lines = city.length > 10 && words.length > 1
    ? (() => {
        // split at the word break nearest the middle
        let best = 1;
        for (let i = 1; i < words.length; i++) {
          if (Math.abs(words.slice(0, i).join(" ").length - city.length / 2) < Math.abs(words.slice(0, best).join(" ").length - city.length / 2)) best = i;
        }
        return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      })()
    : [city];
  const longest = Math.max(...lines.map((l) => l.length));
  const avail = (portrait ? w - 64 : w * 0.55);
  const size = Math.min(portrait ? 76 : 190, avail / (longest * 0.56));
  const x = portrait ? 40 : 96;
  const baseY = portrait ? h - 56 - (lines.length - 1) * size * 1.02 : h - 110 - (lines.length - 1) * size * 1.02;
  const r = portrait ? 150 : strip ? 110 : 330;
  const cx = portrait ? 270 : strip ? 1380 : 1180;
  const cy = portrait ? 190 : strip ? 130 : 380;
  const rail = Math.floor(h / 14);
  return (
    <svg {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": `${city} poster` })} viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full rounded-[14px]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={`dots-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.9" fill={accent} />
        </pattern>
        <clipPath id={`clip-${uid}`}><circle cx={cx} cy={cy} r={r} /></clipPath>
      </defs>
      <rect width={w} height={h} fill={CANVAS} />
      <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={`url(#dots-${uid})`} clipPath={`url(#clip-${uid})`} />
      {Array.from({ length: rail }, (_, i) => (
        <circle key={i} cx={10} cy={(i + 0.5) * (h / rail)} r={3.2} fill={accent} />
      ))}
      {!decorative && lines.map((line, i) => (
        <text key={line} x={x} y={baseY + i * size * 1.02} fill={BONE} fontFamily="Fraunces, ui-serif, Georgia, serif" fontWeight={600} fontSize={size} letterSpacing={-size * 0.02}>{line}</text>
      ))}
    </svg>
  );
}
