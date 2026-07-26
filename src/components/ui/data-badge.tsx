import { cn } from "@/lib/utils";
import {
  DATA_PROVENANCE_BADGE_CLASS,
  DATA_PROVENANCE_LABEL,
  DATA_PROVENANCE_DESCRIPTION,
  type DataProvenance,
} from "@/lib/analytics/data-labels";

export function DataBadge({
  kind,
  className,
}: {
  kind: DataProvenance;
  className?: string;
}) {
  const dotColor = {
    live: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse",
    estimated: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
    demo: "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] animate-pulse",
    unavailable: "bg-zinc-500",
  }[kind];

  return (
    <span
      title={DATA_PROVENANCE_DESCRIPTION[kind]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all shadow-sm",
        DATA_PROVENANCE_BADGE_CLASS[kind],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      {DATA_PROVENANCE_LABEL[kind]}
    </span>
  );
}
