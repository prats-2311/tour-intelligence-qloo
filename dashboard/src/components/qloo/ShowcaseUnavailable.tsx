import { Link } from "react-router-dom";
import { Notice } from "./Notice";

/** Shown instead of replaying the placeholder when a ?showcase=1 page is opened but the private recording did not load. */
export function ShowcaseUnavailable({ sampleHref }: { sampleHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Notice>
        <span className="min-w-0">The showcase recording is unavailable right now.</span>
        <Link to={sampleHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] bg-paper-raised px-3 text-[13px] font-semibold text-canvas-text hover:bg-[#3a3932] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">Open the sample tour</Link>
      </Notice>
    </div>
  );
}
