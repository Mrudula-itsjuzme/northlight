import "server-only";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  jobs,
  contentPipelineSteps,
  usageEvents,
  aiEvaluations,
  recommendationFeedback,
  visibilityAlerts,
} from "@/db/schema";
import { getExecutionMode } from "@/lib/ai/llm";
import { getCacheMetrics } from "@/lib/ai/cache";

export type DiagnosticsSummary = {
  executionMode: "live" | "demo" | "test";
  openAiKeyConfigured: boolean;
  workerQueue: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
  };
  llmTelemetry: {
    totalTokens: number;
    totalCostCents: number;
    stepCount: number;
  };
  usageEventsCount: number;
  cacheMetrics: {
    totalHits: number;
    tokensSaved: number;
    costSavedCents: number;
  };
  evaluations: {
    avgOverallScore: number;
    totalEvaluations: number;
  };
  recommendations: {
    acceptanceRatePct: number;
    totalFeedbackCount: number;
  };
  visibilityAlertsCount: number;
};

export async function getDiagnosticsSummary(brandId?: string): Promise<DiagnosticsSummary> {
  const db = getDb();

  // 1. Worker Queue metrics
  const jobCondition = brandId ? eq(jobs.brandId, brandId) : undefined;
  const jobRows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(jobCondition)
    .groupBy(jobs.status);

  const workerQueue = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const row of jobRows) {
    if (row.status in workerQueue) {
      workerQueue[row.status as keyof typeof workerQueue] = row.count;
    }
  }

  // 2. LLM Telemetry
  const stepCondition = brandId ? eq(contentPipelineSteps.brandId, brandId) : undefined;
  const [telemetry] = await db
    .select({
      totalTokens: sql<number>`coalesce(sum(${contentPipelineSteps.tokensUsed}), 0)::int`,
      totalCostCents: sql<number>`coalesce(sum(${contentPipelineSteps.costCents}), 0)::int`,
      stepCount: sql<number>`count(*)::int`,
    })
    .from(contentPipelineSteps)
    .where(stepCondition);

  // 3. Usage events count
  const usageCondition = brandId ? eq(usageEvents.brandId, brandId) : undefined;
  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(usageCondition);

  // 4. Cache metrics
  const cacheStats = await getCacheMetrics(brandId);

  // 5. Evaluation metrics
  const evalCondition = brandId ? eq(aiEvaluations.brandId, brandId) : undefined;
  const [evalStats] = await db
    .select({
      avgOverall: sql<number>`coalesce(avg(${aiEvaluations.overallScore}), 0)::real`,
      total: sql<number>`count(*)::int`,
    })
    .from(aiEvaluations)
    .where(evalCondition);

  // 6. Recommendation acceptance
  const recCondition = brandId ? eq(recommendationFeedback.brandId, brandId) : undefined;
  const [recStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`coalesce(sum(case when ${recommendationFeedback.action} in ('accepted', 'manually_edited') then 1 else 0 end), 0)::int`,
    })
    .from(recommendationFeedback)
    .where(recCondition);

  const acceptanceRatePct = recStats?.total ? (recStats.accepted / recStats.total) * 100 : 0;

  // 7. Visibility alerts count
  const alertCondition = brandId ? eq(visibilityAlerts.brandId, brandId) : undefined;
  const [alertsStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(visibilityAlerts)
    .where(alertCondition);

  return {
    executionMode: getExecutionMode(),
    openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    workerQueue,
    llmTelemetry: {
      totalTokens: telemetry?.totalTokens ?? 0,
      totalCostCents: telemetry?.totalCostCents ?? 0,
      stepCount: telemetry?.stepCount ?? 0,
    },
    usageEventsCount: usage?.count ?? 0,
    cacheMetrics: {
      totalHits: cacheStats.totalHits,
      tokensSaved: cacheStats.totalTokensSaved,
      costSavedCents: cacheStats.totalCostSavedCents,
    },
    evaluations: {
      avgOverallScore: evalStats?.avgOverall ?? 0,
      totalEvaluations: evalStats?.total ?? 0,
    },
    recommendations: {
      acceptanceRatePct,
      totalFeedbackCount: recStats?.total ?? 0,
    },
    visibilityAlertsCount: alertsStats?.count ?? 0,
  };
}
