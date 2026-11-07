/** Grey placeholder shapes shown while data loads. They pulse, and keep the layout from jumping. */
export function Bone({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line ${className}`} />;
}

/** A list of card-shaped rows (friends, queue, appeals, audit log...). */
export function SkeletonRows({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
          <Bone className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-4 w-1/2" />
            <Bone className="h-3 w-3/4" />
          </div>
          <Bone className="h-8 w-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** A detail page: heading, a few text lines and an action button. */
export function SkeletonDetail({ className = '' }: { className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className={`flex flex-col gap-4 ${className}`}>
      <Bone className="h-8 w-2/3" />
      <div className="rounded-2xl bg-white p-4 shadow-sm flex flex-col gap-3">
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-5/6" />
        <Bone className="h-4 w-2/3" />
      </div>
      <Bone className="h-12 w-full rounded-xl" />
    </div>
  );
}

/** Chat-bubble placeholders for a message thread. */
export function SkeletonMessages() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading messages" className="flex flex-col gap-2">
      <Bone className="h-9 w-2/3 self-start rounded-2xl" />
      <Bone className="h-9 w-1/2 self-end rounded-2xl" />
      <Bone className="h-9 w-3/5 self-start rounded-2xl" />
    </div>
  );
}
