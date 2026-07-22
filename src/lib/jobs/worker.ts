import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { JOB_PAYLOAD_SCHEMAS, type JobType } from "@/lib/jobs/types";
import { processDocument } from "@/lib/brand-brain/process-document";
import { generateContentBrief } from "@/lib/content/brief";
import { runPipeline } from "@/lib/content/pipeline/runner";
import { persistGapReportsForCompetitor } from "@/lib/competitors/persist-gap-reports";
import { persistVisibilitySnapshot } from "@/lib/ai/visibility/persist-snapshot";
import { computeAndPersistRecommendations } from "@/lib/recommendations/compute-core";
import { rescoreAllKeywords } from "@/lib/keywords/rescore";
import { recordUsageEvent } from "@/lib/usage/record";

/**
 * Generic worker for the Postgres-backed `jobs` table (no Redis/BullMQ —
 * see ARCHITECTURE.md for why). Polls for queued, due rows
 * (status='queued' AND run_at<=now()), claims ONE at a time via an
 * atomic UPDATE ... WHERE status='queued' RETURNING (so two worker
 * processes racing on the same row can't both claim it — only one
 * UPDATE actually matches the still-'queued' row), dispatches by `type`
 * to the matching handler, and records status/attempts/result/error on
 * the row.
 *
 * Every handler below calls the SAME role-free "core" function the
 * corresponding `"use server"` action calls (e.g. `runPipeline`,
 * `persistGapReportsForCompetitor`) — the worker is a second caller of
 * that shared core, not a reimplementation, so job-processed and
 * UI-triggered work behave identically. The worker deliberately does
 * NOT go through `requireRoleOrThrow` (there is no authenticated request
 * to check): a job row only exists because some earlier request DID
 * pass that role gate before enqueuing it, so the worker is the trusted
 * system actor executing already-authorized work — the same trust
 * boundary a queue consumer has in any request/worker split.
 */

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
  const outcome = await persistGapReportsForCompetitor(brandId, competitorId);
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
};

/**
 * Atomically claims the single oldest queued+due job (if any), flipping
 * it to 'running' and incrementing attempts in the same UPDATE so a
 * concurrent worker can never claim the same row twice — the update's
 * WHERE clause only matches rows still in 'queued', and Postgres row
 * locking makes the read-then-write atomic per row.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const db = getDb();

  const [claimed] = await db.execute<{
    id: string;
    brand_id: string | null;
    type: JobType;
    payload: unknown;
    attempts: number;
    max_attempts: number;
  }>(sql`
    UPDATE jobs
    SET status = 'running', attempts = attempts + 1, started_at = now()
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
  };
}

const RETRY_BACKOFF_MS = 30_000;

export type FailureOutcome =
  | { status: "queued"; runAt: Date }
  | { status: "failed" };

/**
 * Pure decision of what happens to a job row after its handler throws:
 * retry with a linear backoff (30s * attempts so far) if attempts hasn't
 * reached maxAttempts yet, otherwise a permanent failure. Extracted as a
 * pure function (no DB access) so the retry/backoff policy itself can be
 * unit tested without a database — see
 * tests/unit/jobs-worker.test.ts.
 */
export function decideFailureOutcome(
  job: Pick<ClaimedJob, "attempts" | "maxAttempts">,
  now: Date = new Date(),
): FailureOutcome {
  if (job.attempts < job.maxAttempts) {
    return { status: "queued", runAt: new Date(now.getTime() + RETRY_BACKOFF_MS * job.attempts) };
  }
  return { status: "failed" };
}

/**
 * Executes one claimed job to completion, recording the outcome on the
 * row. On failure: if attempts have not yet reached maxAttempts, the job
 * is put back to 'queued' with a short backoff (run_at pushed into the
 * future, via `decideFailureOutcome`) so it will be retried; once
 * maxAttempts is reached, it's marked 'failed' permanently with the
 * error message recorded.
 */
export async function processJob(job: ClaimedJob): Promise<void> {
  const db = getDb();

  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);

    const { result } = await handler(job.payload, job.brandId);

    await db
      .update(jobs)
      .set({ status: "succeeded", completedAt: new Date(), result: result ?? {}, error: null })
      .where(eq(jobs.id, job.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = decideFailureOutcome(job);

    await db
      .update(jobs)
      .set(
        outcome.status === "queued"
          ? { status: "queued", error: message, runAt: outcome.runAt }
          : { status: "failed", completedAt: new Date(), error: message },
      )
      .where(eq(jobs.id, job.id));
  }
}

/**
 * Claims and processes jobs one at a time until none are left due, or
 * `maxJobs` have been processed (whichever comes first) — used by both
 * the one-shot `scripts/worker.ts` entrypoint (run on a schedule/cron)
 * and tests. Returns the number of jobs processed.
 */
export async function runWorkerOnce(maxJobs = 25): Promise<number> {
  let processed = 0;
  while (processed < maxJobs) {
    const job = await claimNextJob();
    if (!job) break;
    await processJob(job);
    processed++;
  }
  return processed;
}

/**
 * Convenience query used by the Analytics/Jobs surfaces and tests:
 * counts a brand's jobs grouped by status (queued/running/succeeded/
 * failed/cancelled).
 */
export async function countJobsByStatus(brandId: string) {
  const db = getDb();
  return db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.brandId, brandId))
    .groupBy(jobs.status);
}
