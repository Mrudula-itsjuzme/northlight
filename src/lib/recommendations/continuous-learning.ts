import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { recommendationFeedback } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type FeedbackAction = "accepted" | "ignored" | "dismissed" | "postponed" | "manually_edited";

const VALID_ACTIONS = new Set<FeedbackAction>(["accepted", "ignored", "dismissed", "postponed", "manually_edited"]);

/**
 * Records user feedback action for a recommendation.
 */
export async function recordRecommendationFeedback(input: {
  brandId: string;
  recommendationId: string;
  sourceSignal: "keyword" | "competitor" | "content" | "visibility";
  action: FeedbackAction;
  actorUserId?: string;
}): Promise<ActionResult<void>> {
  try {
    if (!VALID_ACTIONS.has(input.action)) {
      return { ok: false, error: `Invalid feedback action: ${input.action}` };
    }
    await requireRoleOrThrow(input.brandId, "editor");
    const db = getDb();

    // Prefix recommendation ID with sourceSignal to avoid cross-signal ID collisions
    const scopedId = `${input.sourceSignal}:${input.recommendationId}`;

    await db.insert(recommendationFeedback).values({
      brandId: input.brandId,
      recommendationId: scopedId,
      sourceSignal: input.sourceSignal,
      action: input.action,
    });

    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to record recommendation feedback." };
  }
}

export type SignalWeights = {
  keyword: number;
  competitor: number;
  content: number;
  visibility: number;
};

const BASE_WEIGHTS: SignalWeights = {
  keyword: 0.3,
  competitor: 0.3,
  content: 0.2,
  visibility: 0.2,
};

/**
 * Computes evolved signal weights dynamically from historical feedback conversion rates.
 * Ranking logic remains 100% deterministic and unit-testable.
 */
export async function getEvolvedSignalWeights(brandId: string): Promise<SignalWeights> {
  try {
    const db = getDb();
    const feedbackStats = await db
      .select({
        sourceSignal: recommendationFeedback.sourceSignal,
        acceptedCount: sql<number>`coalesce(sum(case when ${recommendationFeedback.action} in ('accepted', 'manually_edited') then 1 else 0 end), 0)::int`,
        dismissedCount: sql<number>`coalesce(sum(case when ${recommendationFeedback.action} in ('dismissed', 'ignored') then 1 else 0 end), 0)::int`,
      })
      .from(recommendationFeedback)
      .where(eq(recommendationFeedback.brandId, brandId))
      .groupBy(recommendationFeedback.sourceSignal);

    const statsMap = new Map<string, { accepted: number; dismissed: number }>();
    for (const row of feedbackStats) {
      statsMap.set(row.sourceSignal, { accepted: row.acceptedCount, dismissed: row.dismissedCount });
    }

    const evolved: SignalWeights = { ...BASE_WEIGHTS };
    let totalEvolved = 0;

    for (const key of ["keyword", "competitor", "content", "visibility"] as const) {
      const stats = statsMap.get(key) || { accepted: 0, dismissed: 0 };
      const totalDecisions = stats.accepted + stats.dismissed;
      const conversionRate = totalDecisions > 0 ? stats.accepted / totalDecisions : 0.5;
      
      const multiplier = 0.6 + conversionRate * 0.8;
      evolved[key] = BASE_WEIGHTS[key] * multiplier;
      totalEvolved += evolved[key];
    }

    if (totalEvolved === 0 || Number.isNaN(totalEvolved)) {
      return BASE_WEIGHTS;
    }

    // Renormalize so weights sum strictly to 1.0
    for (const key of ["keyword", "competitor", "content", "visibility"] as const) {
      evolved[key] = evolved[key] / totalEvolved;
    }

    return evolved;
  } catch {
    return BASE_WEIGHTS;
  }
}

/**
 * Builds a transparent human-readable explanation for why a recommendation received its final rank score.
 */
export function buildRankExplanation(
  sourceSignal: string,
  baseScore: number,
  signalWeight: number,
  finalRankScore: number,
): string {
  return `Ranked #${finalRankScore.toFixed(3)} based on base score ${baseScore.toFixed(2)} with dynamic ${sourceSignal} signal weight ${(signalWeight * 100).toFixed(1)}%.`;
}
