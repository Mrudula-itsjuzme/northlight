import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  articles,
  contentPipelineRuns,
  contentBriefs,
  keywords,
  aiVisibilitySnapshots,
  aiPlatforms,
  recommendations,
  brands,
} from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";
import {
  articleStatusBreakdown,
  articlesGeneratedCount,
  articlesPublishedCount,
  contentVelocityByWeek,
  medianTimeToFirstPublishHours,
  estimatedAiCostUsd,
  totalTokensUsed,
  visibilityTrendByWeek,
  keywordCoverageRatio,
  averagePriorityScore,
  completedRecommendationsCount,
  type ArticleRow,
} from "@/lib/analytics/compute";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export type AnalyticsSnapshot = {
  isDemoBrand: boolean;
  articles: {
    generated: number;
    published: number;
    statusBreakdown: Record<ArticleRow["status"], number>;
    velocityByWeek: Array<{ week: string; count: number }>;
    medianTimeToFirstPublishHours: number | null;
  };
  cost: {
    estimatedUsd: number;
    totalTokens: number;
    completedRunCount: number;
  };
  keywords: {
    total: number;
    covered: number;
    coverageRatio: number;
    averagePriorityScore: number | null;
  };
  visibility: {
    trendByWeek: Array<{ week: string; platformKey: string; mentionRate: number; sampleSize: number }>;
    overallMentionRate: number | null;
    totalSnapshots: number;
  };
  recommendations: {
    done: number;
    total: number;
  };
  /**
   * Demo/estimated traffic — no real analytics (GA4/Search Console/etc.)
   * integration exists in this environment. Deterministically derived
   * from the brand id so numbers are stable across renders/refreshes
   * (not re-randomized on every request) rather than hardcoded, and
   * ALWAYS rendered behind a "Demo" badge — see data-labels.ts.
   */
  demoTraffic: {
    organicSessionsLast30d: number;
    aiReferralSessionsLast30d: number;
  };
}

/** Deterministic small PRNG seeded from a string, so demo traffic numbers are stable per brand. */
function seededInt(seed: string, min: number, max: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return Math.floor(min + normalized * (max - min + 1));
}

export async function getAnalyticsSnapshot(brandId: string): Promise<ActionResult<AnalyticsSnapshot>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const [brandRow] = await db
      .select({ isDemo: brands.isDemo })
      .from(brands)
      .where(eq(brands.id, brandId))
      .limit(1);

    const articleRows = await db
      .select({
        id: articles.id,
        status: articles.status,
        createdAt: articles.createdAt,
        publishedAt: articles.publishedAt,
        seoScore: articles.seoScore,
        eeatScore: articles.eeatScore,
        aiReadinessScore: articles.aiReadinessScore,
      })
      .from(articles)
      .where(eq(articles.brandId, brandId));

    const runRows = await db
      .select({
        id: contentPipelineRuns.id,
        status: contentPipelineRuns.status,
        totalCostCents: contentPipelineRuns.totalCostCents,
        totalTokens: contentPipelineRuns.totalTokens,
        createdAt: contentPipelineRuns.createdAt,
        updatedAt: contentPipelineRuns.updatedAt,
      })
      .from(contentPipelineRuns)
      .where(eq(contentPipelineRuns.brandId, brandId));

    const keywordRows = await db
      .select({ id: keywords.id, priorityScore: keywords.priorityScore })
      .from(keywords)
      .where(eq(keywords.brandId, brandId));

    const briefKeywordIds = await db
      .select({ keywordId: contentBriefs.keywordId })
      .from(contentBriefs)
      .where(eq(contentBriefs.brandId, brandId));
    const coveredKeywordIds = new Set(
      briefKeywordIds.map((b) => b.keywordId).filter((id): id is string => id !== null),
    );

    const visibilityRows = await db
      .select({
        platformKey: aiPlatforms.key,
        mentioned: aiVisibilitySnapshots.mentioned,
        createdAt: aiVisibilitySnapshots.createdAt,
      })
      .from(aiVisibilitySnapshots)
      .innerJoin(aiPlatforms, eq(aiVisibilitySnapshots.platformId, aiPlatforms.id))
      .where(eq(aiVisibilitySnapshots.brandId, brandId));

    const recommendationRows = await db
      .select({ id: recommendations.id, status: recommendations.status })
      .from(recommendations)
      .where(eq(recommendations.brandId, brandId));

    const totalMentioned = visibilityRows.filter((v) => v.mentioned).length;

    const keywordsWithCoverage = keywordRows.map((k) => ({
      id: k.id,
      hasContent: coveredKeywordIds.has(k.id),
    }));
    const coverage = keywordCoverageRatio(keywordsWithCoverage);

    const snapshot: AnalyticsSnapshot = {
      isDemoBrand: brandRow?.isDemo ?? false,
      articles: {
        generated: articlesGeneratedCount(articleRows),
        published: articlesPublishedCount(articleRows),
        statusBreakdown: articleStatusBreakdown(articleRows),
        velocityByWeek: contentVelocityByWeek(articleRows),
        medianTimeToFirstPublishHours: medianTimeToFirstPublishHours(articleRows),
      },
      cost: {
        estimatedUsd: estimatedAiCostUsd(runRows),
        totalTokens: totalTokensUsed(runRows),
        completedRunCount: runRows.filter((r) => r.status === "completed").length,
      },
      keywords: {
        total: coverage.total,
        covered: coverage.covered,
        coverageRatio: coverage.ratio,
        averagePriorityScore: averagePriorityScore(keywordRows),
      },
      visibility: {
        trendByWeek: visibilityTrendByWeek(visibilityRows),
        overallMentionRate: visibilityRows.length === 0 ? null : totalMentioned / visibilityRows.length,
        totalSnapshots: visibilityRows.length,
      },
      recommendations: completedRecommendationsCount(recommendationRows),
      demoTraffic: {
        organicSessionsLast30d: seededInt(`${brandId}:organic`, 800, 6000),
        aiReferralSessionsLast30d: seededInt(`${brandId}:ai_referral`, 50, 900),
      },
    };

    return { ok: true, data: snapshot };
  } catch (err) {
    return toActionError(err, "Failed to load analytics.");
  }
}
