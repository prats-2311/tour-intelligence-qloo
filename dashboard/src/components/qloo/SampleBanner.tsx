import { FlaskConical } from "lucide-react";

export function SampleBanner() {
  return (
    <div className="flex w-full items-center gap-2 bg-canvas-raised px-4 py-2 text-[13px] text-canvas-muted">
      <FlaskConical size={14} aria-hidden />
      <span>Sample data — illustrative, not Qloo output</span>
    </div>
  );
}
