function Block({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

function CardBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

/** Fixed-height fallback while the Tour Board chunk loads, so the page never paints blank or jumps. */
export function TourBoardSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex h-[560px] w-full max-w-2xl flex-col gap-3 overflow-hidden">
      <Block className="h-12 w-full" />
      <CardBlock className="h-[88px] w-full" />
      <CardBlock className="h-[88px] w-full" />
      <CardBlock className="h-[88px] w-full" />
    </div>
  );
}

/** Fixed-height fallback while the Taste Insights chunk loads. */
export function TasteInsightsSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-[640px] w-full flex-col gap-4 overflow-hidden">
      <Block className="h-10 w-64" />
      <CardBlock className="h-[96px] w-full" />
      <CardBlock className="h-[320px] w-full" />
    </div>
  );
}

/** Fixed-geometry fallback while the City Playbook chunk loads: poster, identity lines, one card. */
export function PlaybookSkeleton() {
  return (
    <div aria-hidden="true" className="-mx-4 -mt-6 flex h-[720px] flex-col gap-3 overflow-hidden lg:mx-0 lg:mt-0">
      <Block className="aspect-[4/5] w-full !rounded-none lg:aspect-[16/9] lg:!rounded-[18px]" />
      <div className="flex flex-col gap-2 px-4 lg:px-0">
        <Block className="h-7 w-48" />
        <Block className="h-4 w-24" />
        <Block className="h-7 w-full" />
      </div>
      <CardBlock className="mx-4 h-[280px] lg:mx-0" />
    </div>
  );
}
