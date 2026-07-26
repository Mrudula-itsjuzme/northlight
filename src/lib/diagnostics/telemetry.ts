import "server-only";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, contentPipelineSteps, usageEvents } from "@/db/schema";
import { getExecutionMode } from "@/lib/ai/llm";

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
  };
}
