"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  keywords,
  gapReports,
  competitors,
  articles,
  aiVisibilitySnapshots,
  aiPrompts,
  aiPlatforms,
  recommendations,
} from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { rankRecommendations, type RecommendationSignals } from "@/lib/recommendations/rank";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

async function gatherSignals(brandId: string): Promise<RecommendationSignals> {
  const db = getDb();

  const keywordRows = await db
    .select({ id: keywords.id, term: keywords.term, priorityScore: keywords.priorityScore })
    .from(keywords)
    .where(eq(keywords.brandId, brandId));

  const gapRows = await db
    .select({
      competitorId: gapReports.competitorId,
      type: gapReports.type,
      priorityScore: gapReports.priorityScore,
      findings: gapReports.findings,
      competitorName: competitors.name,
    })
    .from(gapReports)
    .innerJoin(competitors, eq(gapReports.competitorId, competitors.id))
    .where(eq(gapReports.brandId, brandId));

  const contentRows = await db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      seoScore: articles.seoScore,
      eeatScore: articles.eeatScore,
      aiReadinessScore: articles.aiReadinessScore,
    })
    .from(articles)
    .where(eq(articles.brandId, brandId));

  const visibilityRows = await db
    .select({
      promptId: aiVisibilitySnapshots.promptId,
      promptText: aiPrompts.promptText,
      platformDisplayName: aiPlatforms.displayName,
      mentioned: aiVisibilitySnapshots.mentioned,
      sentiment: aiVisibilitySnapshots.sentiment,
    })
    .from(aiVisibilitySnapshots)
    .innerJoin(aiPrompts, eq(aiVisibilitySnapshots.promptId, aiPrompts.id))
    .innerJoin(aiPlatforms, eq(aiVisibilitySnapshots.platformId, aiPlatforms.id))
    .where(eq(aiVisibilitySnapshots.brandId, brandId));

  return {
    keywords: keywordRows
      .filter((k) => k.priorityScore !== null)
      .map((k) => ({ keywordId: k.id, term: k.term, priorityScore: k.priorityScore! })),
    gaps: gapRows
      .filter((g) => g.priorityScore !== null)
      .map((g) => {
        const findings = g.findings as { items?: Array<{ title: string }> } | null;
        return {
          competitorId: g.competitorId,
          competitorName: g.competitorName,
          type: g.type,
          priorityScore: g.priorityScore!,
          findingTitle: findings?.items?.[0]?.title ?? `${g.type} gap identified`,
        };
      }),
    content: contentRows.map((c) => ({
      articleId: c.id,
      title: c.title,
      status: c.status,
      seoScore: c.seoScore,
      eeatScore: c.eeatScore,
      aiReadinessScore: c.aiReadinessScore,
    })),
    visibility: visibilityRows,
  };
}

/**
 * Recomputes recommendations for a brand: gathers real signals from
 * keywords/gap-reports/articles/visibility-snapshots, ranks them via the
 * pure `rankRecommendations` function, and replaces the brand's prior
 * recommendation set (a full recompute rather than an incremental merge,
 * since ranking is relative to the CURRENT full signal set — the same
 * "full recompute, not incremental" approach Phase 5 uses for keyword
 * clusters).
 */
export async function computeRecommendations(
  brandId: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const signals = await gatherSignals(brandId);
    const ranked = rankRecommendations(signals);

    await db.transaction(async (tx) => {
      await tx.delete(recommendations).where(eq(recommendations.brandId, brandId));

      if (ranked.length > 0) {
        await tx.insert(recommendations).values(
          ranked.map((rec) => ({
            brandId,
            title: rec.title,
            reason: rec.reason,
            evidence: rec.evidence,
            impact: rec.impact,
            confidence: rec.confidence,
            action: rec.action,
            sourceSignal: rec.sourceSignal,
            rankScore: rec.rankScore,
            status: "new" as const,
          })),
        );
      }
    });

    revalidatePath("/recommendations");
    return { ok: true, data: { count: ranked.length } };
  } catch (err) {
    return toActionError(err, "Failed to compute recommendations.");
  }
}

export type RecommendationItem = {
  id: string;
  title: string;
  reason: string;
  evidence: unknown;
  impact: string;
  confidence: number;
  action: string;
  sourceSignal: string;
  status: string;
  rankScore: number;
};

export async function listRecommendations(
  brandId: string,
): Promise<ActionResult<RecommendationItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.brandId, brandId))
      .orderBy(desc(recommendations.rankScore));

    return { ok: true, data: rows };
  } catch (err) {
    return toActionError(err, "Failed to list recommendations.");
  }
}

export async function updateRecommendationStatus(
  brandId: string,
  recommendationId: string,
  status: "new" | "in_progress" | "done" | "dismissed",
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .update(recommendations)
      .set({ status, updatedAt: new Date() })
      .where(
        and(eq(recommendations.id, recommendationId), eq(recommendations.brandId, brandId)),
      );

    revalidatePath("/recommendations");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to update recommendation status.");
  }
}
