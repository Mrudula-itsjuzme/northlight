import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one reused "nothing here yet" placeholder, used consistently
 * across every list/table in the app (Keyword Explorer, Competitor
 * Radar, Content Pipeline, AI Visibility, Recommendations, Brand Brain,
 * Analytics) instead of each page hand-rolling its own
 * `<p className="text-sm text-muted-foreground">No X yet.</p>`. Always
 * describes a real, reachable next action rather than a dead end.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center",
        className,
      )}
    >
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
