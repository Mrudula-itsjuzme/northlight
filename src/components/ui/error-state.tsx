import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one reused error surface for a failed server action / data fetch
 * (`ActionResult` with `ok: false`), used consistently instead of each
 * page hand-rolling its own
 * `<div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">`.
 * Always renders the REAL error message returned by the action (never a
 * generic "something went wrong"), so users/developers can see exactly
 * what failed (e.g. a RoleError's actual permission message).
 */
export function ErrorState({ message, className }: { message: string; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
