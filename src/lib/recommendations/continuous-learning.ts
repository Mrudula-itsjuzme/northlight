import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { recommendationFeedback } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";
import { config } from "@/lib/config";

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

export type EvolvedWeightsResult = {
  weights: SignalWeights;
  explanations: Record<string, string>;
  isColdStart: boolean;
  sampleCount: number;
};

const BASE_WEIGHTS: SignalWeights = config.recommendations.sourceWeights;

const MIN_SAMPLE_THRESHOLD = config.recommendations.learning.minSampleThreshold;
const BAYESIAN_M = config.recommendations.learning.bayesianM;
const MIN_WEIGHT_BOUND = config.recommendations.learning.minWeightBound;
const MAX_WEIGHT_BOUND = config.recommendations.learning.maxWeightBound;

/**
 * Computes evolved signal weights using Bayesian m-estimate smoothing, sample thresholds, and weight bounds.
 */
export async function getEvolvedSignalWeightsWithAudit(brandId: string): Promise<EvolvedWeightsResult> {
  try {
    const db = getDb();
    const feedbackStats = await db
      .select({
        sourceSignal: recommendationFeedback.sourceSignal,
        acceptedCount: sql<number>`coalesce(sum(case when ${recommendationFeedback.action} in ('accepted', 'manually_edited') then 1 else 0 end), 0)::int`,
        dismissedCount: sql<number>`coalesce(sum(case when ${recommendationFeedback.action} in ('dismissed', 'ignored') then 1 else 0 end), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(recommendationFeedback)
      .where(eq(recommendationFeedback.brandId, brandId))
      .groupBy(recommendationFeedback.sourceSignal);

    const statsMap = new Map<string, { accepted: number; dismissed: number; total: number }>();
    let grandTotalDecisions = 0;

    for (const row of feedbackStats) {
      statsMap.set(row.sourceSignal, {
        accepted: row.acceptedCount,
        dismissed: row.dismissedCount,
        total: row.totalCount,
      });
      grandTotalDecisions += row.totalCount;
    }

    const explanations: Record<string, string> = {};

    // Cold-Start Check: Require minimum sample size threshold before evolving weights
    if (grandTotalDecisions < MIN_SAMPLE_THRESHOLD) {
      for (const key of ["keyword", "competitor", "content", "visibility"] as const) {
        explanations[key] = `Cold-start baseline weight ${(BASE_WEIGHTS[key] * 100).toFixed(1)}% applied (samples ${grandTotalDecisions} < threshold ${MIN_SAMPLE_THRESHOLD}).`;
      }
      return {
        weights: { ...BASE_WEIGHTS },
        explanations,
        isColdStart: true,
        sampleCount: grandTotalDecisions,
      };
    }

    const unnormalized: SignalWeights = { ...BASE_WEIGHTS };
    let sumUnnormalized = 0;

    for (const key of ["keyword", "competitor", "content", "visibility"] as const) {
      const stats = statsMap.get(key) || { accepted: 0, dismissed: 0, total: 0 };
      const prior = BASE_WEIGHTS[key];

      // Bayesian m-estimate smoothing: (accepted + m * prior) / (total + m)
      const smoothedRate = (stats.accepted + BAYESIAN_M * prior) / (stats.total + BAYESIAN_M);
      const multiplier = 0.5 + smoothedRate * 1.0;
      const rawWeight = prior * multiplier;

      // Apply strict min/max weight bounds to prevent wild oscillation
      const boundedWeight = Math.min(MAX_WEIGHT_BOUND, Math.max(MIN_WEIGHT_BOUND, rawWeight));
      unnormalized[key] = boundedWeight;
      sumUnnormalized += boundedWeight;
    }

    const finalWeights: SignalWeights = { ...BASE_WEIGHTS };
    for (const key of ["keyword", "competitor", "content", "visibility"] as const) {
      finalWeights[key] = unnormalized[key] / sumUnnormalized;
      const stats = statsMap.get(key) || { accepted: 0, dismissed: 0, total: 0 };
      explanations[key] = `Evolved weight ${(finalWeights[key] * 100).toFixed(1)}% (from ${stats.accepted}/${stats.total} positive conversions, Bayesian smoothed).`;
    }

    return {
      weights: finalWeights,
      explanations,
      isColdStart: false,
      sampleCount: grandTotalDecisions,
    };
  } catch {
    return {
      weights: { ...BASE_WEIGHTS },
      explanations: { default: "Fallback to baseline weights due to database error." },
      isColdStart: true,
      sampleCount: 0,
    };
  }
}

/**
 * Computes evolved signal weights dynamically from historical feedback conversion rates.
 */
export async function getEvolvedSignalWeights(brandId: string): Promise<SignalWeights> {
  const result = await getEvolvedSignalWeightsWithAudit(brandId);
  return result.weights;
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
