import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { fitDocuments, readDocument, type AttachedDoc } from "./extract";

export const SAMPLE_DOC_URL = "/samples/example-artist-2024-tour-recap.txt";
export const SAMPLE_DOC_NAME = "example-artist-2024-tour-recap.txt";

/** Attached documents live in React state only: no storage, lost when the tab closes. */
export function useDocuments(): { docs: AttachedDoc[]; notes: string[]; busy: boolean; addFiles(files: ArrayLike<File>): Promise<void>; addSample(): Promise<void>; remove(id: string): void; /** Every id attached this session -> file name, so earlier answers keep their file labels after a Remove. */ names: Record<string, string> } {
  const [docs, setDocs] = useState<AttachedDoc[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<AttachedDoc[]>([]);
  const counter = useRef(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const add = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    const incoming: AttachedDoc[] = [];
    const problems: string[] = [];
    for (const f of files) {
      try { incoming.push(await readDocument(f)); } catch (e) { problems.push(e instanceof Error ? e.message : `Could not read ${f.name}`); }
    }
    const prev = ref.current;
    const fit = fitDocuments(ref.current, incoming, () => `d${++counter.current}`);
    setNames((cur) => ({ ...cur, ...Object.fromEntries(fit.docs.map((d) => [d.id, d.name])) }));
    ref.current = fit.docs;
    setDocs(fit.docs);
    setNotes([...problems, ...fit.notes]);
    const before = new Set(prev.map((d) => d.id));
    for (const d of fit.docs) if (!before.has(d.id)) toast({ message: `Added ${d.name}.`, tone: "success" });
    for (const n of fit.notes) toast({ message: n, tone: "info" });
    for (const p of problems) toast({ message: p, tone: "error" });
    setBusy(false);
  }, [toast]);

  const addFiles = useCallback((files: ArrayLike<File>) => add(Array.from(files)), [add]);
  const addSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_DOC_URL);
      if (!res.ok) throw new Error("sample missing");
      await add([new File([await res.text()], SAMPLE_DOC_NAME, { type: "text/plain" })]);
    } catch {
      setNotes(["Could not load the sample file."]);
      toast({ message: "Could not load the sample file.", tone: "error" });
    }
  }, [add, toast]);
  const remove = useCallback((id: string) => {
    const gone = ref.current.find((d) => d.id === id);
    ref.current = ref.current.filter((d) => d.id !== id);
    if (gone) toast({ message: `Removed ${gone.name}.`, tone: "info" });
    setDocs(ref.current);
    setNotes([]);
  }, [toast]);
  return { docs, notes, names, busy, addFiles, addSample, remove };
}
