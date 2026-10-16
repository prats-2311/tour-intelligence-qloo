import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { saveTourAsCampaign, type SaveTourInput } from "@/lib/api";
import { useCampaignContext } from "@/lib/campaignContext";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const textBtn = "inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50";

// Live runs only (the page never renders it for sample books).
export function SaveAsCampaign({ input }: { input: SaveTourInput }) {
  const { refresh, setActiveCampaignId } = useCampaignContext();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inFlight = useRef(false);

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus({ kind: "saving" });
    let campaignId: string;
    try {
      ({ campaign_id: campaignId } = await saveTourAsCampaign(input));
    } catch (err) {
      inFlight.current = false;
      setStatus({ kind: "error", message: (err as Error).message });
      return;
    }
    // The campaign exists now: a failed list refresh must not offer "Try again",
    // which would insert a duplicate. Refresh first (as NewCampaign does) so the
    // switcher doesn't fall back to the previous campaign, but don't fail on it.
    try { await refresh(); } catch { /* the campaign page refetches its list */ }
    setActiveCampaignId(campaignId);
    setStatus({ kind: "saved" });
  };

  if (status.kind === "saved") return <Link to="/campaign" className={textBtn}>Open campaign</Link>;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <button type="button" onClick={() => void save()} disabled={status.kind === "saving"} className={textBtn}>
        {status.kind === "saving" ? "Saving…" : status.kind === "error" ? "Try again" : "Save as campaign"}
      </button>
      {status.kind === "error" && <p role="alert" className="text-[13px] text-state-error">Couldn't save the campaign — {status.message}</p>}
    </div>
  );
}
