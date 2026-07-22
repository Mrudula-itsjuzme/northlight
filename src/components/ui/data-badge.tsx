import { cn } from "@/lib/utils";
import {
  DATA_PROVENANCE_BADGE_CLASS,
  DATA_PROVENANCE_LABEL,
  DATA_PROVENANCE_DESCRIPTION,
  type DataProvenance,
} from "@/lib/analytics/data-labels";

/**
 * The one reused badge for the live/estimated/demo labeling convention
 * (see src/lib/analytics/data-labels.ts). Used across Analytics,
 * Keyword Explorer, Competitor Radar, AI Visibility, and anywhere else
 * is_demo/seeded or estimated data is shown, so the same visual language
 * means the same thing everywhere in the app.
 */
export function DataBadge({
  kind,
  className,
}: {
  kind: DataProvenance;
  className?: string;
}) {
  return (
    <span
      title={DATA_PROVENANCE_DESCRIPTION[kind]}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        DATA_PROVENANCE_BADGE_CLASS[kind],
        className,
      )}
    >
      {DATA_PROVENANCE_LABEL[kind]}
    </span>
  );
}
