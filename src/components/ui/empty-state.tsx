import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

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
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/40 backdrop-blur-sm p-10 text-center transition-all duration-300 hover:border-primary/30 hover:bg-card/60",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-glow-sm">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground/90">{title}</p>
        {description && <p className="max-w-md text-sm text-muted-foreground leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
