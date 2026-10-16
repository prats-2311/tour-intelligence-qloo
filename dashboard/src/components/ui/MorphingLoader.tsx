// Three-bar level-meter loader: keyframes live in index.css
// (.morphing-loader); this centers it with an optional caption for the
// full-page loading states.
export function MorphingLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10" role="status">
      <div className="morphing-loader" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-canvas-muted">
        {label ?? "Loading…"}
      </p>
    </div>
  );
}
