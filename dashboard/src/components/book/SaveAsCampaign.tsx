import { useState } from "react";
import { Link } from "react-router-dom";
import { saveTourAsCampaign, type SaveTourInput } from "@/lib/api";
import { useCampaignContext } from "@/lib/campaignContext";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const textBtn = "inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-canvas-text underline-offset-[0.18em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50";

// Live runs only (the page never renders it for sample books).
export function SaveAsCampaign({ input }: { input: SaveTourInput }) {
  const { refresh, setActiveCampaignId } = useCampaignContext();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const { campaign_id } = await saveTourAsCampaign(input);
      // Refresh the list before selecting the new id, as NewCampaign does, so the
      // switcher doesn't fall back to the previous campaign.
      await refresh();
      setActiveCampaignId(campaign_id);
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  };

  if (status.kind === "saved") return <Link to="/campaign" className={textBtn}>Open campaign</Link>;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <button type="button" onClick={() => void save()} disabled={status.kind === "saving"} className={textBtn}>
        {status.kind === "error" ? "Try again" : "Save as campaign"}
      </button>
      {status.kind === "error" && <p role="alert" className="text-[13px] text-state-error">Couldn't save the campaign — {status.message}</p>}
    </div>
  );
}
