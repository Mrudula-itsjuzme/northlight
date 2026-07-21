"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { contentBriefs, contentPipelineRuns, contentPipelineSteps } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { generateContentBrief } from "@/lib/content/brief";
import { runPipeline, retryPipelineStage } from "@/lib/content/pipeline/runner";
import type { PipelineStage } from "@/lib/content/pipeline/schemas";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function createBriefForKeyword(
  brandId: string,
  keywordId: string,
): Promise<ActionResult<{ briefId: string }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const briefId = await generateContentBrief(brandId, keywordId);
    revalidatePath("/content");
    return { ok: true, data: { briefId } };
  } catch (err) {
    return toActionError(err, "Failed to generate content brief.");
  }
}

export type ContentBriefItem = {
  id: string;
  title: string;
  targetAudience: string | null;
  searchIntent: string | null;
  createdAt: Date;
};

export async function listContentBriefs(brandId: string): Promise<ActionResult<ContentBriefItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(contentBriefs)
      .where(eq(contentBriefs.brandId, brandId))
      .orderBy(desc(contentBriefs.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        targetAudience: r.targetAudience,
        searchIntent: r.searchIntent,
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    return toActionError(err, "Failed to list content briefs.");
  }
}

/**
 * Starts a content pipeline run for a brief and drives it to completion
 * synchronously (in this MVP; a production version would enqueue a
 * `run_content_pipeline` job — see Phase 12 — and have the worker call
 * runPipeline, but the pipeline logic itself is identical either way).
 */
export async function startPipelineRun(
  brandId: string,
  briefId: string,
): Promise<ActionResult<{ runId: string; status: string; articleId?: string }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const [run] = await db
      .insert(contentPipelineRuns)
      .values({ brandId, briefId, status: "pending" })
      .returning({ id: contentPipelineRuns.id });

    const result = await runPipeline(run.id);

    revalidatePath("/content");
    return { ok: true, data: { runId: run.id, status: result.status, articleId: result.articleId } };
  } catch (err) {
    return toActionError(err, "Failed to start pipeline run.");
  }
}

export async function retryFailedStage(
  brandId: string,
  runId: string,
  stage: PipelineStage,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    await retryPipelineStage(runId, stage);
    revalidatePath("/content");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to retry pipeline stage.");
  }
}

export type PipelineRunSummary = {
  id: string;
  briefId: string;
  status: string;
  currentStage: string | null;
  articleId: string | null;
  totalCostCents: number;
  totalTokens: number;
  createdAt: Date;
};

export type PipelineStepSummary = {
  id: string;
  stage: string;
  status: string;
  errorMessage: string | null;
  costCents: number;
  tokensUsed: number;
  attempt: number;
};

export async function listPipelineRuns(
  brandId: string,
): Promise<ActionResult<PipelineRunSummary[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(contentPipelineRuns)
      .where(eq(contentPipelineRuns.brandId, brandId))
      .orderBy(desc(contentPipelineRuns.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        briefId: r.briefId,
        status: r.status,
        currentStage: r.currentStage,
        articleId: r.articleId,
        totalCostCents: r.totalCostCents,
        totalTokens: r.totalTokens,
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    return toActionError(err, "Failed to list pipeline runs.");
  }
}

export async function listPipelineSteps(
  brandId: string,
  runId: string,
): Promise<ActionResult<PipelineStepSummary[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(contentPipelineSteps)
      .where(and(eq(contentPipelineSteps.runId, runId), eq(contentPipelineSteps.brandId, brandId)))
      .orderBy(asc(contentPipelineSteps.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        stage: r.stage,
        status: r.status,
        errorMessage: r.errorMessage,
        costCents: r.costCents,
        tokensUsed: r.tokensUsed,
        attempt: r.attempt,
      })),
    };
  } catch (err) {
    return toActionError(err, "Failed to list pipeline steps.");
  }
}
