"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeRecommendations,
  updateRecommendationStatus,
  type RecommendationItem,
} from "@/lib/recommendations/actions";
import { Button } from "@/components/ui/button";

const IMPACT_COLOR: Record<string, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
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
    <div className="space-y-4">
      <Button onClick={onRecompute} disabled={pending}>
        {pending ? "Computing..." : "Recompute recommendations"}
      </Button>

      {recommendations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No recommendations yet. Add keywords/competitors/content/visibility
          data, then recompute.
        </p>
      )}

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div key={rec.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{rec.title}</p>
                <p className="text-sm text-muted-foreground">{rec.reason}</p>
                <p className="mt-1 text-sm">{rec.action}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <span className={IMPACT_COLOR[rec.impact] ?? ""}>{rec.impact} impact</span>
                <span className="text-muted-foreground">confidence {rec.confidence.toFixed(2)}</span>
                <span className="text-muted-foreground">source: {rec.sourceSignal}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Status:</label>
              <select
                value={rec.status}
                disabled={statusPendingId === rec.id}
                onChange={(e) => onStatusChange(rec.id, e.target.value as (typeof STATUS_OPTIONS)[number])}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
