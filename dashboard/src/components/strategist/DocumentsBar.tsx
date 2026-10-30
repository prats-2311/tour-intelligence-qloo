import { FileText, X } from "lucide-react";
import { useRef, useState } from "react";
import { ACCEPT } from "@/lib/docs/extract";
import type { useDocuments } from "@/lib/docs/useDocuments";

export const DOCS_PRIVACY_COPY = "Your files stay in this tab. Their text is sent to the AI model with your questions and is not stored. Nothing is sent to Qloo.";

/** The "Add your documents" control: file input, drop zone, file chips, notes and the privacy line. */
export function DocumentsBar({ docs }: { docs: ReturnType<typeof useDocuments> }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div data-testid="doc-dropzone" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void docs.addFiles(e.dataTransfer?.files ?? []); }}
      className={`mb-2 rounded-lg border border-dashed px-3 py-2 ${over ? "border-gold bg-canvas-raised" : "border-canvas-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={docs.busy} className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold text-canvas-text underline outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">
          <FileText size={16} aria-hidden /> Add your documents
        </button>
        <button type="button" onClick={() => void docs.addSample()} disabled={docs.busy} className="min-h-11 rounded-lg px-2 text-[14px] text-canvas-muted underline outline-none hover:text-canvas-text focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-50">Try with a sample file</button>
        <input ref={input} type="file" multiple accept={ACCEPT} aria-label="Choose files to add" className="sr-only" tabIndex={-1}
          onChange={(e) => { void docs.addFiles(e.target.files ?? []); e.target.value = ""; }} />
      </div>
      <p className="text-[13px] text-canvas-muted">{DOCS_PRIVACY_COPY}</p>
      <p className="text-[13px] text-canvas-muted">Up to 3 files (.pdf, .txt, .md, .csv), 40 pages each. Drop them here or choose them.</p>
      {docs.docs.length > 0 && (
        <ul aria-label="Attached documents" className="mt-1.5 flex flex-wrap gap-2">
          {docs.docs.map((d) => (
            <li key={d.id} className="flex items-center gap-1.5 rounded-full bg-canvas-raised py-1 pl-3 pr-1 text-[13px] text-canvas-text">
              <span>{d.name}</span>
              <span className="text-canvas-muted">{d.pages.length === 1 ? "1 page" : `${d.pages.length} pages`}</span>
              <button type="button" aria-label={`Remove ${d.name}`} onClick={() => docs.remove(d.id)} className="flex size-8 items-center justify-center rounded-full outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-gold/50"><X size={14} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
