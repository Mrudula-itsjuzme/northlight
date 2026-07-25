import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading...", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 p-12 text-sm text-muted-foreground glass-panel rounded-xl border border-primary/10 shadow-sm", className)}>
      <div className="relative flex items-center justify-center">
        <div className="absolute h-8 w-8 rounded-full bg-primary/20 animate-ping opacity-75" />
        <Sparkles className="h-6 w-6 text-primary animate-spin" aria-hidden="true" />
      </div>
      <span className="font-medium text-foreground/80 tracking-wide animate-pulse">{label}</span>
    </div>
  );
}
