import "server-only";
import { config } from "@/lib/config";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { JOB_PAYLOAD_SCHEMAS, type JobType } from "@/lib/jobs/types";
import { processDocument } from "@/lib/brand-brain/process-document";
import { generateContentBrief } from "@/lib/content/brief";
import { runPipeline } from "@/lib/content/pipeline/runner";
import { persistGapReportsForCompetitor, persistGapReportsForCompetitorWithRealFetch } from "@/lib/competitors/persist-gap-reports";
import { isBrandDemo } from "@/lib/brands/actions";
import { persistVisibilitySnapshot } from "@/lib/ai/visibility/persist-snapshot";
import { computeAndPersistRecommendations } from "@/lib/recommendations/compute-core";
import { rescoreAllKeywords } from "@/lib/keywords/rescore";
import { recordUsageEvent } from "@/lib/usage/record";

export type JobHandlerResult = { result?: Record<string, unknown> };

async function handleEmbedBrandDocument(payload: unknown, brandId: string | null): Promise<JobHandlerResult> {
  const { brandDocumentId } = JOB_PAYLOAD_SCHEMAS.embed_brand_document.parse(payload);
  const outcome = await processDocument(brandDocumentId);
  if (brandId) await recordUsageEvent(brandId, "embedding", outcome.chunkCount, { adapter: outcome.adapter });
  return { result: outcome };
}

async function handleGenerateContentBrief(payload: unknown): Promise<JobHandlerResult> {
  const { brandId, keywordId } = JOB_PAYLOAD_SCHEMAS.generate_content_brief.parse(payload);
  const briefId = await generateContentBrief(brandId, keywordId);
  return { result: { briefId } };
}

async function handleRunContentPipeline(payload: unknown, brandId: string | null): Promise<JobHandlerResult> {
  const { runId } = JOB_PAYLOAD_SCHEMAS.run_content_pipeline.parse(payload);
  const outcome = await runPipeline(runId);
  if (brandId) await recordUsageEvent(brandId, "content_pipeline_run", 1, { runId, status: outcome.status });
  return { result: outcome };
}

async function handleGenerateGapReport(payload: unknown): Promise<JobHandlerResult> {
  const { brandId, competitorId } = JOB_PAYLOAD_SCHEMAS.generate_gap_report.parse(payload);
  const isDemo = await isBrandDemo(brandId);
  const outcome = isDemo
    ? await persistGapReportsForCompetitor(brandId, competitorId)
    : await persistGapReportsForCompetitorWithRealFetch(brandId, competitorId);
  await recordUsageEvent(brandId, "gap_report_generation", outcome.reportCount, { competitorId });
  return { result: outcome };
}

async function handleRunAiVisibilitySnapshot(payload: unknown): Promise<JobHandlerResult> {
  const { brandId, promptId } = JOB_PAYLOAD_SCHEMAS.run_ai_visibility_snapshot.parse(payload);
  const outcome = await persistVisibilitySnapshot(brandId, promptId);
  await recordUsageEvent(brandId, "ai_visibility_check", outcome.snapshotCount, { promptId });
  return { result: outcome };
}

async function handleComputeRecommendations(payload: unknown): Promise<JobHandlerResult> {
  const { brandId } = JOB_PAYLOAD_SCHEMAS.compute_recommendations.parse(payload);
  const outcome = await computeAndPersistRecommendations(brandId);
  return { result: outcome };
}

async function handleRecomputeKeywordScores(payload: unknown): Promise<JobHandlerResult> {
  const { brandId } = JOB_PAYLOAD_SCHEMAS.recompute_keyword_scores.parse(payload);
  const outcome = await rescoreAllKeywords(brandId);
  await recordUsageEvent(brandId, "keyword_rescore", outcome.scored);
  return { result: outcome };
}

const HANDLERS: Record<JobType, (payload: unknown, brandId: string | null) => Promise<JobHandlerResult>> = {
  embed_brand_document: (p, b) => handleEmbedBrandDocument(p, b),
  generate_content_brief: (p) => handleGenerateContentBrief(p),
  run_content_pipeline: (p, b) => handleRunContentPipeline(p, b),
  generate_gap_report: (p) => handleGenerateGapReport(p),
  run_ai_visibility_snapshot: (p) => handleRunAiVisibilitySnapshot(p),
  compute_recommendations: (p) => handleComputeRecommendations(p),
  recompute_keyword_scores: (p) => handleRecomputeKeywordScores(p),
};

export type ClaimedJob = {
  id: string;
  brandId: string | null;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
};

/**
 * Atomically claims the single oldest queued or stale running job, setting lease metadata.
 */
export async function claimNextJob(workerId = "worker-1"): Promise<ClaimedJob | null> {
  const db = getDb();

  try {
    const [claimed] = await db.execute<{
      id: string;
      brand_id: string | null;
      type: JobType;
      payload: unknown;
      attempts: number;
      max_attempts: number;
    }>(sql`
      UPDATE jobs
      SET status = 'running',
          attempts = attempts + 1,
          started_at = now(),
          locked_at = now(),
          locked_by = ${workerId},
          last_attempt_at = now()
      WHERE id = (
        SELECT id FROM jobs
        WHERE (status = 'queued' AND run_at <= now())
           OR (status = 'running' AND locked_at < now() - INTERVAL '5 minutes')
        ORDER BY run_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, brand_id, type, payload, attempts, max_attempts
    `);

    if (!claimed) return null;

    return {
      id: claimed.id,
      brandId: claimed.brand_id,
      type: claimed.type,
      payload: claimed.payload,
      attempts: claimed.attempts,
      maxAttempts: claimed.max_attempts,
      lockedBy: workerId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;

    // Handle case where locked_at column doesn't exist on un-migrated Postgres schema instances
    if (code === "42703" || message.includes("locked_at")) {
      try {
        await db.execute(sql`
          ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone;
          ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by text;
          ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;
          ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
        `);

        const [claimed] = await db.execute<{
          id: string;
          brand_id: string | null;
          type: JobType;
          payload: unknown;
          attempts: number;
          max_attempts: number;
        }>(sql`
          UPDATE jobs
          SET status = 'running',
              attempts = attempts + 1,
              started_at = now(),
              locked_at = now(),
              locked_by = ${workerId},
              last_attempt_at = now()
          WHERE id = (
            SELECT id FROM jobs
            WHERE (status = 'queued' AND run_at <= now())
               OR (status = 'running' AND locked_at < now() - INTERVAL '5 minutes')
            ORDER BY run_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, brand_id, type, payload, attempts, max_attempts
        `);

        if (!claimed) return null;

        return {
          id: claimed.id,
          brandId: claimed.brand_id,
          type: claimed.type,
          payload: claimed.payload,
          attempts: claimed.attempts,
          maxAttempts: claimed.max_attempts,
          lockedBy: workerId,
        };
      } catch {
        // Fallback for un-migrated databases where DDL is restricted
        const [claimed] = await db.execute<{
          id: string;
          brand_id: string | null;
          type: JobType;
          payload: unknown;
          attempts: number;
          max_attempts: number;
        }>(sql`
          UPDATE jobs
          SET status = 'running',
              attempts = attempts + 1,
              started_at = now()
          WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'queued' AND run_at <= now()
            ORDER BY run_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, brand_id, type, payload, attempts, max_attempts
        `);

        if (!claimed) return null;

        return {
          id: claimed.id,
          brandId: claimed.brand_id,
          type: claimed.type,
          payload: claimed.payload,
          attempts: claimed.attempts,
          maxAttempts: claimed.max_attempts,
          lockedBy: null,
        };
      }
    }
    throw err;
  }
}

const RETRY_BACKOFF_MS = config.jobs.retryBackoffMs;

export type FailureOutcome =
  | { status: "queued"; runAt: Date }
  | { status: "failed" };

export function decideFailureOutcome(
  job: Pick<ClaimedJob, "attempts" | "maxAttempts">,
  now: Date = new Date(),
): FailureOutcome {
  if (job.attempts < job.maxAttempts) {
    return { status: "queued", runAt: new Date(now.getTime() + RETRY_BACKOFF_MS * job.attempts) };
  }
  return { status: "failed" };
}

export async function processJob(job: ClaimedJob): Promise<void> {
  const db = getDb();

  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);

    const { result } = await handler(job.payload, job.brandId);

    await db
      .update(jobs)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        result: result ?? {},
        error: null,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(jobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = decideFailureOutcome(job);

    await db
      .update(jobs)
      .set(
        outcome.status === "queued"
          ? { status: "queued", error: message, runAt: outcome.runAt, lockedAt: null, lockedBy: null }
          : { status: "failed", completedAt: new Date(), error: message, lockedAt: null, lockedBy: null },
      )
      .where(eq(jobs.id, job.id));
  }
}

export async function runWorkerOnce(maxJobs = config.jobs.maxJobsPerRun): Promise<number> {
  let processed = 0;
  while (processed < maxJobs) {
    const job = await claimNextJob();
    if (!job) break;
    await processJob(job);
    processed++;
  }
  return processed;
}

export async function countJobsByStatus(brandId: string) {
  const db = getDb();
  return db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.brandId, brandId))
    .groupBy(jobs.status);
}
