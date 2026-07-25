"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeRecommendations,
  updateRecommendationStatus,
  type RecommendationItem,
} from "@/lib/recommendations/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Lightbulb, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const IMPACT_BADGE: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-400 border-rose-500/30 shadow-glow-sm",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-secondary text-muted-foreground border-border",
};

const STATUS_OPTIONS = ["new", "in_progress", "done", "dismissed"] as const;

export function RecommendationList({
  brandId,
  recommendations,
}: {
  brandId: string;
  recommendations: RecommendationItem[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);

  async function onRecompute() {
    setPending(true);
    try {
      await computeRecommendations(brandId);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onStatusChange(id: string, status: (typeof STATUS_OPTIONS)[number]) {
    setStatusPendingId(id);
    try {
      await updateRecommendationStatus(brandId, id, status);
      router.refresh();
    } finally {
      setStatusPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="gradient" size="sm" onClick={onRecompute} disabled={pending} className="gap-1.5 shadow-glow">
          {pending ? (
            <>
              <Sparkles className="h-4 w-4 animate-spin" /> Computing Recommendations...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Recompute ROI Action Queue
            </>
          )}
        </Button>
      </div>

      {recommendations.length === 0 && (
        <EmptyState
          icon={Lightbulb}
          title="No action recommendations queued"
          description="Add keywords, run competitor gap reports, or trigger AI visibility snapshots, then click Recompute above to generate new priorities."
        />
      )}

      <div className="space-y-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="rounded-2xl border border-border/80 bg-card/40 p-5 space-y-3 backdrop-blur-md transition-all hover:border-primary/30"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      IMPACT_BADGE[rec.impact] ?? "bg-secondary text-muted-foreground",
                    )}
                  >
                    {rec.impact} Impact
                  </span>
                  <span className="text-xs font-mono text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded">
                    Signal: {rec.sourceSignal}
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground">{rec.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{rec.reason}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                <span className="font-mono text-muted-foreground text-[11px]">
                  Confidence: {(rec.confidence * 100).toFixed(0)}%
                </span>
                <span className="font-mono text-emerald-400 text-[11px] font-semibold">
                  Score: {rec.rankScore.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action Box */}
            <div className="rounded-xl border border-border/60 bg-card/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                <span>{rec.action}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-semibold text-muted-foreground">State:</label>
                <select
                  value={rec.status}
                  disabled={statusPendingId === rec.id}
                  onChange={(e) => onStatusChange(rec.id, e.target.value as (typeof STATUS_OPTIONS)[number])}
                  className="h-8 rounded-lg border border-border/80 bg-background/80 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer capitalize"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
