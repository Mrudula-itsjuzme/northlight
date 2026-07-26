import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variant === "default" && "border-transparent bg-primary/15 text-primary border border-primary/20",
        variant === "secondary" && "border-transparent bg-accent text-muted-foreground border border-border/40",
        variant === "outline" && "border border-border text-foreground",
        variant === "destructive" && "border-transparent bg-rose-500/15 text-rose-400 border border-rose-500/20",
        className,
      )}
      {...props}
    />
  );
}
