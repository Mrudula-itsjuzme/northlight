import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one reused in-flight indicator for a pending client action (e.g.
 * "Recompute recommendations", "Run snapshot", "Generate gap report"),
 * used consistently instead of each page hand-rolling its own "..." text
 * swap. Most buttons in this app already disable themselves and swap
 * their own label while pending (e.g. "Computing..."), which is fine and
 * unchanged; this component is for standalone loading placeholders where
 * an entire section of content is being (re)fetched, not just one
 * button's label.
 */
export function LoadingState({ label = "Loading...", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
