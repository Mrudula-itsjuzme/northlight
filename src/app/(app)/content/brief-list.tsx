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
import { FileText } from "lucide-react";

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
        title="No content briefs yet"
        description="Generate a brief from a keyword above to start the content pipeline."
      />
    );
  }

  return (
    <div className="space-y-4">
      {briefs.map((brief) => {
        const briefRuns = runs.filter((r) => r.briefId === brief.id);
        return (
          <div key={brief.id} className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{brief.title}</p>
                <p className="text-xs text-muted-foreground">
                  {brief.searchIntent ?? "intent unknown"} · {brief.targetAudience ?? "general audience"}
                </p>
              </div>
              <Button size="sm" disabled={pendingId === brief.id} onClick={() => onStartRun(brief.id)}>
                {pendingId === brief.id ? "Running..." : "Start pipeline run"}
              </Button>
            </div>

            {briefRuns.length > 0 && (
              <div className="mt-3 space-y-2">
                {briefRuns.map((run) => (
                  <div key={run.id} className="rounded border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        Run {run.id.slice(0, 8)} — <StatusBadge status={run.status} />{" "}
                        {run.currentStage && `(${STAGE_LABEL[run.currentStage] ?? run.currentStage})`}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {run.totalTokens} tokens · ${(run.totalCostCents / 100).toFixed(2)}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => onViewSteps(run.id)}>
                          {expandedRun === run.id ? "Hide" : "View"} steps
                        </Button>
                        {run.articleId && (
                          <Button asChild size="sm">
                            <Link href={`/content/${run.articleId}`}>Edit article</Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {expandedRun === run.id && stepsByRun[run.id] && (
                      <div className="mt-2 divide-y">
                        {stepsByRun[run.id].map((step) => (
                          <div key={step.id} className="flex items-center justify-between py-1.5 text-xs">
                            <span>
                              {STAGE_LABEL[step.stage] ?? step.stage} — <StatusBadge status={step.status} />
                              {step.errorMessage && (
                                <span className="text-destructive"> {step.errorMessage}</span>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">
                                attempt {step.attempt} · {step.tokensUsed}tok · $
                                {(step.costCents / 100).toFixed(2)}
                              </span>
                              {step.status === "failed" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pendingId === run.id}
                                  onClick={() => onRetry(run.id, step.stage)}
                                >
                                  Retry
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
  const color =
    status === "completed"
      ? "text-success-foreground"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={color}>{status}</span>;
}
