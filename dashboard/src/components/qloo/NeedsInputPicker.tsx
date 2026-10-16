export function NeedsInputPicker({ candidates, onPick, artist }: { candidates: Array<{ id: string; name: string; type?: string }>; onPick: (id: string, name: string) => void; artist?: string }) {
  return (
    <section aria-labelledby="needs-input-title" className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <h1 id="needs-input-title" className="font-title text-[24px] text-canvas-text">{artist ? `Which ${artist}?` : "Which artist?"}</h1>
      <p className="text-[13px] text-canvas-muted">Qloo found more than one match. Pick the one you mean; nothing is chosen for you.</p>
      <ul className="flex flex-col gap-0.5">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id, c.name)}
              className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 bg-paper px-4 py-2 text-left hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span className="min-w-0 truncate text-[15px] font-semibold text-canvas-text">{c.name}</span>
              {c.type && <span className="shrink-0 text-[13px] text-canvas-muted">{c.type}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
