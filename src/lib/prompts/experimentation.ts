import "server-only";
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { promptVersions, promptVersionTelemetry } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type PromptVersionRecord = {
  id: string;
  promptKey: string;
  version: string;
  promptText: string;
  isActive: boolean;
  trafficPercentage: number;
  brandId: string | null;
  experimentName: string | null;
  activationDate: Date | null;
};

export type PromptPerformanceReport = {
  versionId: string;
  version: string;
  experimentName: string | null;
  sampleCount: number;
  avgLatencyMs: number;
  avgEvaluationScore: number;
  humanEditCount: number;
  publicationCount: number;
  totalTokens: number;
  totalCostCents: number;
};

/**
 * Gets the active prompt version for a key and optional brand override.
 */
export async function getActivePromptVersion(
  promptKey: string,
  brandId?: string,
): Promise<PromptVersionRecord | null> {
  const db = getDb();
  
  // Check brand-specific active prompt override first
  if (brandId) {
    const [override] = await db
      .select({
        id: promptVersions.id,
        promptKey: promptVersions.promptKey,
        version: promptVersions.version,
        promptText: promptVersions.promptText,
        isActive: promptVersions.isActive,
        trafficPercentage: promptVersions.trafficPercentage,
        brandId: promptVersions.brandId,
        experimentName: promptVersions.experimentName,
        activationDate: promptVersions.activationDate,
      })
      .from(promptVersions)
      .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.brandId, brandId), eq(promptVersions.isActive, true)))
      .orderBy(desc(promptVersions.createdAt))
      .limit(1);

    if (override) return override;
  }

  // Fallback to global active prompt
  const [globalActive] = await db
    .select({
      id: promptVersions.id,
      promptKey: promptVersions.promptKey,
      version: promptVersions.version,
      promptText: promptVersions.promptText,
      isActive: promptVersions.isActive,
      trafficPercentage: promptVersions.trafficPercentage,
      brandId: promptVersions.brandId,
      experimentName: promptVersions.experimentName,
      activationDate: promptVersions.activationDate,
    })
    .from(promptVersions)
    .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.isActive, true)))
    .orderBy(desc(promptVersions.createdAt))
    .limit(1);

  return globalActive || null;
}

/**
 * Creates a new prompt version (or experiment variant).
 */
export async function createPromptVersion(
  input: {
    promptKey: string;
    version: string;
    promptText: string;
    brandId?: string;
    experimentName?: string;
    trafficPercentage?: number;
  },
  actorUserId?: string,
): Promise<ActionResult<{ promptVersionId: string }>> {
  try {
    if (input.brandId) {
      await requireRoleOrThrow(input.brandId, "admin");
    }
    const db = getDb();

    const [record] = await db
      .insert(promptVersions)
      .values({
        promptKey: input.promptKey,
        version: input.version,
        promptText: input.promptText,
        brandId: input.brandId ?? null,
        experimentName: input.experimentName ?? null,
        trafficPercentage: input.trafficPercentage ?? 100,
        isActive: true,
      })
      .returning({ id: promptVersions.id });

    return { ok: true, data: { promptVersionId: record.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create prompt version." };
  }
}

/**
 * Rolls back to a prior prompt version by deactivating current active versions and activating target version.
 */
export async function rollbackPromptVersion(
  promptKey: string,
  targetVersionId: string,
  brandId?: string,
  actorUserId?: string,
): Promise<ActionResult<void>> {
  try {
    if (brandId) await requireRoleOrThrow(brandId, "admin");
    const db = getDb();

    // Deactivate currently active versions for key
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(
        brandId
          ? and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.brandId, brandId))
          : eq(promptVersions.promptKey, promptKey),
      );

    // Activate target
    await db
      .update(promptVersions)
      .set({ isActive: true, activationDate: new Date() })
      .where(eq(promptVersions.id, targetVersionId));

    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to rollback prompt version." };
  }
}

/**
 * Logs generation performance telemetry per prompt version.
 */
export async function recordPromptTelemetry(input: {
  promptVersionId: string;
  generationLatencyMs: number;
  evaluationScore?: number;
  humanEditsCount?: number;
  published?: boolean;
  recommendationAccepted?: boolean;
  tokensUsed?: number;
  costCents?: number;
}): Promise<void> {
  const db = getDb();
  await db.insert(promptVersionTelemetry).values({
    promptVersionId: input.promptVersionId,
    generationLatencyMs: input.generationLatencyMs,
    evaluationScore: input.evaluationScore ?? null,
    humanEditsCount: input.humanEditsCount ?? 0,
    published: input.published ?? false,
    recommendationAccepted: input.recommendationAccepted ?? null,
    tokensUsed: input.tokensUsed ?? 0,
    costCents: input.costCents ?? 0,
  });
}

/**
 * Generates comparative performance report comparing prompt versions for a key.
 */
export async function comparePromptPerformance(
  promptKey: string,
): Promise<ActionResult<PromptPerformanceReport[]>> {
  try {
    const db = getDb();
    const versions = await db
      .select({
        id: promptVersions.id,
        version: promptVersions.version,
        experimentName: promptVersions.experimentName,
      })
      .from(promptVersions)
      .where(eq(promptVersions.promptKey, promptKey));

    const reports: PromptPerformanceReport[] = [];
    for (const v of versions) {
      const [stats] = await db
        .select({
          sampleCount: sql<number>`count(*)::int`,
          avgLatencyMs: sql<number>`coalesce(avg(${promptVersionTelemetry.generationLatencyMs}), 0)::int`,
          avgEvaluationScore: sql<number>`coalesce(avg(${promptVersionTelemetry.evaluationScore}), 0)::real`,
          humanEditCount: sql<number>`coalesce(sum(${promptVersionTelemetry.humanEditsCount}), 0)::int`,
          publicationCount: sql<number>`coalesce(sum(case when ${promptVersionTelemetry.published} then 1 else 0 end), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${promptVersionTelemetry.tokensUsed}), 0)::int`,
          totalCostCents: sql<number>`coalesce(sum(${promptVersionTelemetry.costCents}), 0)::int`,
        })
        .from(promptVersionTelemetry)
        .where(eq(promptVersionTelemetry.promptVersionId, v.id));

      reports.push({
        versionId: v.id,
        version: v.version,
        experimentName: v.experimentName,
        sampleCount: stats?.sampleCount || 0,
        avgLatencyMs: stats?.avgLatencyMs || 0,
        avgEvaluationScore: stats?.avgEvaluationScore || 0,
        humanEditCount: stats?.humanEditCount || 0,
        publicationCount: stats?.publicationCount || 0,
        totalTokens: stats?.totalTokens || 0,
        totalCostCents: stats?.totalCostCents || 0,
      });
    }

    return { ok: true, data: reports };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to compare prompt performance." };
  }
}
