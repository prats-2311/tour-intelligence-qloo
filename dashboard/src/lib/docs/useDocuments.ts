import { useCallback, useRef, useState } from "react";
import { fitDocuments, readDocument, type AttachedDoc } from "./extract";

export const SAMPLE_DOC_URL = "/samples/example-artist-2024-tour-recap.txt";
export const SAMPLE_DOC_NAME = "example-artist-2024-tour-recap.txt";

/** Attached documents live in React state only: no storage, lost when the tab closes. */
export function useDocuments(): { docs: AttachedDoc[]; notes: string[]; busy: boolean; addFiles(files: ArrayLike<File>): Promise<void>; addSample(): Promise<void>; remove(id: string): void } {
  const [docs, setDocs] = useState<AttachedDoc[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<AttachedDoc[]>([]);

  const add = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    const incoming: AttachedDoc[] = [];
    const problems: string[] = [];
    for (const f of files) {
      try { incoming.push(await readDocument(f)); } catch (e) { problems.push(e instanceof Error ? e.message : `Could not read ${f.name}`); }
    }
    const fit = fitDocuments(ref.current, incoming);
    ref.current = fit.docs;
    setDocs(fit.docs);
    setNotes([...problems, ...fit.notes]);
    setBusy(false);
  }, []);

  const addFiles = useCallback((files: ArrayLike<File>) => add(Array.from(files)), [add]);
  const addSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_DOC_URL);
      if (!res.ok) throw new Error("sample missing");
      await add([new File([await res.text()], SAMPLE_DOC_NAME, { type: "text/plain" })]);
    } catch {
      setNotes(["Could not load the sample file."]);
    }
  }, [add]);
  const remove = useCallback((id: string) => {
    ref.current = ref.current.filter((d) => d.id !== id);
    setDocs(ref.current);
    setNotes([]);
  }, []);
  return { docs, notes, busy, addFiles, addSample, remove };
}
