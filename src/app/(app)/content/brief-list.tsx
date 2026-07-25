"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startPipelineRun,
  retryFailedStage,
  listPipelineSteps,
  type ContentBriefItem,
  type PipelineRunSummary,
  type PipelineStepSummary,
} from "@/lib/content/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Play, RotateCcw, ExternalLink, ChevronDown, ChevronUp, Zap, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

const STAGE_LABEL: Record<string, string> = {
  research: "Research",
  strategy: "Strategy",
  outline: "Outline",
  writer: "Writer",
  editor: "Editor",
  seo_optimizer: "SEO Optimizer",
  fact_check: "Fact Check",
  schema_generator: "Schema Generator",
};

export function BriefList({
  brandId,
  briefs,
  runs,
}: {
  brandId: string;
  briefs: ContentBriefItem[];
  runs: PipelineRunSummary[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [stepsByRun, setStepsByRun] = useState<Record<string, PipelineStepSummary[]>>({});
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  async function onStartRun(briefId: string) {
    setPendingId(briefId);
    try {
      await startPipelineRun(brandId, briefId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function onViewSteps(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    const result = await listPipelineSteps(brandId, runId);
    if (result.ok) {
      setStepsByRun((prev) => ({ ...prev, [runId]: result.data }));
    }
    setExpandedRun(runId);
  }

  async function onRetry(runId: string, stage: string) {
    setPendingId(runId);
    try {
      await retryFailedStage(brandId, runId, stage as never);
      const result = await listPipelineSteps(brandId, runId);
      if (result.ok) {
        setStepsByRun((prev) => ({ ...prev, [runId]: result.data }));
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (briefs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No content briefs generated yet"
        description="Generate a brief from your target keyword to trigger the 8-stage AI content creation engine."
      />
    );
  }

  return (
    <div className="space-y-4">
      {briefs.map((brief) => {
        const briefRuns = runs.filter((r) => r.briefId === brief.id);
        return (
          <div
            key={brief.id}
            className="rounded-2xl border border-border/80 bg-card/40 p-5 space-y-4 backdrop-blur-md transition-all hover:border-primary/30"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-violet-400" />
                  {brief.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize bg-secondary/80 px-2 py-0.5 rounded-md font-medium">
                    Intent: {brief.searchIntent ?? "informational"}
                  </span>
                  <span>•</span>
                  <span>Audience: {brief.targetAudience ?? "general"}</span>
                </div>
              </div>

              <Button
                variant="gradient"
                size="sm"
                className="shadow-glow shrink-0 gap-1.5"
                disabled={pendingId === brief.id}
                onClick={() => onStartRun(brief.id)}
              >
                {pendingId === brief.id ? (
                  <>
                    <Sparkles className="h-4 w-4 animate-spin" /> Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" /> Trigger 8-Stage Run
                  </>
                )}
              </Button>
            </div>

            {/* Pipeline Execution Runs */}
            {briefRuns.length > 0 && (
              <div className="space-y-3 pt-2">
                {briefRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-border/60 bg-card/60 p-3.5 text-xs space-y-3 shadow-inner"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-muted-foreground font-semibold">
                          Run #{run.id.slice(0, 8)}
                        </span>
                        <StatusBadge status={run.status} />
                        {run.currentStage && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            Current: {STAGE_LABEL[run.currentStage] ?? run.currentStage}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-[11px]">
                          {run.totalTokens.toLocaleString()} tokens • ${(run.totalCostCents / 100).toFixed(2)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => onViewSteps(run.id)}
                        >
                          {expandedRun === run.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          <span>Steps</span>
                        </Button>
                        {run.articleId && (
                          <Button asChild size="sm" variant="gradient" className="h-7 text-xs gap-1">
                            <Link href={`/content/${run.articleId}`}>
                              <span>Edit Article</span> <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Step-by-Step Stage Breakdown */}
                    {expandedRun === run.id && stepsByRun[run.id] && (
                      <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3 space-y-2 divide-y divide-border/40">
                        {stepsByRun[run.id].map((step) => (
                          <div key={step.id} className="flex items-center justify-between pt-2 first:pt-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                {STAGE_LABEL[step.stage] ?? step.stage}
                              </span>
                              <StatusBadge status={step.status} />
                              {step.errorMessage && (
                                <span className="text-rose-400 flex items-center gap-1 font-medium">
                                  <AlertTriangle className="h-3 w-3" /> {step.errorMessage}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-muted-foreground text-[11px]">
                                Attempt #{step.attempt} • {step.tokensUsed} tok • ${(step.costCents / 100).toFixed(2)}
                              </span>
                              {step.status === "failed" && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-[11px] px-2 gap-1"
                                  disabled={pendingId === run.id}
                                  onClick={() => onRetry(run.id, step.stage)}
                                >
                                  <RotateCcw className="h-3 w-3" /> Retry Stage
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400 border border-rose-500/20">
        <AlertTriangle className="h-3 w-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/20 animate-pulse">
      <Zap className="h-3 w-3" /> {status}
    </span>
  );
}
