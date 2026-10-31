import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/Toast";
import { subscribePlaybooks } from "@/lib/qloo/playbookStore";
import { useTourBoard } from "@/lib/qloo/TourBoardProvider";
import { patchTour, saveTour, ToursError } from "./api";
import { buildSavedRun, exportPlaybooks, summaryOf } from "./savedRun";

export const PATCH_DEBOUNCE_MS = 1500;

/**
 * Which saved tour each run in this page session belongs to, so a re-render never saves twice and later changes patch: `{runId -> tourId}`
 * (the provider gives every run its own id, so re-running the same brief is a new tour). `sig` is what was last sent, so an unchanged run never patches.
 */
const saved = new Map<number, { id: string; sig: string }>();
const inflight = new Set<number>();

const titleOf = (artist: string) => `${artist} tour`;

/** Saves a finished LIVE board run as a draft once, then patches it as playbooks load or the shortlist changes. Never for the example or samples. Renders nothing. */
export function TourAutoSave(): null {
  const { state } = useTourBoard();
  const { toast } = useToast();
  const navigate = useNavigate();
  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const eligible = state.status === "done" && state.source === "live" && !!state.brief && state.cities.length > 0;

  const snapshot = () => {
    const s = stateRef.current;
    const playbooks = s.artist ? exportPlaybooks(s.artist.entityId, s.cities) : {};
    const run = buildSavedRun(s, playbooks);
    return { run, summary: summaryOf(s), sig: `${Object.keys(playbooks).sort().join(",")}|${(s.shortlist ?? []).join(",")}` };
  };

  // First save.
  useEffect(() => {
    const runId = state.runId;
    if (!eligible || runId === undefined || saved.has(runId) || inflight.has(runId)) return;
    if (state.savedId) { saved.set(runId, { id: state.savedId, sig: snapshot().sig }); return; } // opened from My tours: already stored
    inflight.add(runId);
    const { run, summary, sig } = snapshot();
    void saveTour({ title: titleOf(summary.artist), status: "draft", summary, run })
      .then((r) => {
        saved.set(runId, { id: r.id, sig });
        toast({ message: "Saved to My tours", action: { label: "Open My tours", onClick: () => navigate("/tours/mine") } });
      })
      .catch((e: unknown) => {
        if (e instanceof ToursError && e.kind === "disabled") return;
        const message = e instanceof ToursError && (e.kind === "limit" || e.kind === "too_large") ? e.message : "Couldn't save this tour. It stays open here.";
        toast({ message, tone: "error" });
      })
      .finally(() => { inflight.delete(runId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, state.runId]);

  // Later changes: playbooks loading and shortlist edits patch the same tour after a short pause.
  const shortlistKey = (state.shortlist ?? []).join(",");
  useEffect(() => {
    const schedule = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = stateRef.current;
        const entry = s.runId !== undefined ? saved.get(s.runId) : undefined;
        if (!entry || s.status !== "done" || s.source !== "live") return;
        const { run, summary, sig } = snapshot();
        if (sig === entry.sig) return;
        entry.sig = sig;
        void patchTour(entry.id, { summary, run }).catch(() => { entry.sig = ""; });
      }, PATCH_DEBOUNCE_MS);
    };
    const unsub = subscribePlaybooks(schedule);
    if (eligible) schedule();
    return () => { unsub(); clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, state.runId, shortlistKey]);

  return null;
}
