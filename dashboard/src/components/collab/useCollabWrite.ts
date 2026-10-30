import { useCallback } from "react";
import { useToast, type ToastInput } from "@/components/ui/Toast";
import { SHARE_NOTICE } from "@/lib/collab/types";
import { useWorkspace } from "@/lib/collab/workspaceContext";

type WriteArgs = Parameters<ReturnType<typeof useWorkspace>["write"]>;

/** `write` that confirms in a toast: the given words on success, a short alert on failure (unless the caller already shows the error). */
export function useCollabWrite() {
  const w = useWorkspace();
  const { toast } = useToast();
  return useCallback(async (op: WriteArgs[0], payload: WriteArgs[1], saved: string, opts: { quietFail?: boolean } = {}) => {
    const ok = await w.write(op, payload);
    if (ok) toast({ message: saved, tone: "success" });
    else if (!opts.quietFail) toast({ message: "Couldn't save that. Try again.", tone: "error" });
    return ok;
  }, [w, toast]);
}

/** The toast for a finished share: copied (with the privacy reminder), link only (clipboard refused), or no link at all. */
export function shareToast(r: { url: string | null; copied: boolean }, error: string | null): ToastInput {
  if (r.url && r.copied) return { tone: "success", message: `Link copied. ${SHARE_NOTICE}` };
  if (r.url) return { tone: "error", message: `Couldn't copy automatically. Copy this link. ${SHARE_NOTICE}`, selectable: r.url, duration: 15000 };
  return { tone: "error", message: error ?? "Could not create a link." };
}
