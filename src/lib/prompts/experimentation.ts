import "server-only";
import { createHash } from "crypto";
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
 * Computes a deterministic integer bucket value (0-99) for traffic allocation percentage checks.
 */
export function computeBucketValue(seed: string): number {
  const hashHex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const intVal = parseInt(hashHex, 16);
  return intVal % 100;
}

/**
 * Gets the active prompt version for a key with deterministic traffic allocation & brand override checks.
 */
export async function getActivePromptVersion(
  promptKey: string,
  brandId?: string,
  actorUserId?: string,
): Promise<PromptVersionRecord | null> {
  const db = getDb();
  const bucketValue = computeBucketValue(`${brandId || "global"}:${actorUserId || "default"}:${promptKey}`);

  // 1. Check brand-specific active prompt override first
  if (brandId) {
    const brandVersions = await db
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
      .orderBy(desc(promptVersions.createdAt));

    for (const v of brandVersions) {
      if (bucketValue < v.trafficPercentage) {
        return v;
      }
    }
  }

  // 2. Fallback to global active prompts with traffic allocation checks
  const globalVersions = await db
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
    .orderBy(desc(promptVersions.createdAt));

  for (const v of globalVersions) {
    if (bucketValue < v.trafficPercentage) {
      return v;
    }
  }

  return globalVersions[0] || null;
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
        trafficPercentage: Math.min(100, Math.max(1, input.trafficPercentage ?? 100)),
        isActive: true,
      })
      .returning({ id: promptVersions.id });

    return { ok: true, data: { promptVersionId: record.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create prompt version." };
  }
}

/**
 * Rolls back to a prior prompt version after strict prompt key, tenant, and experiment validation.
 */
export async function rollbackPromptVersion(
  promptKey: string,
  targetVersionId: string,
  brandId?: string,
): Promise<ActionResult<void>> {
  try {
    if (brandId) await requireRoleOrThrow(brandId, "admin");
    const db = getDb();

    // Verify target version existence and key/tenant matching to prevent cross-brand rollback mistakes
    const [target] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, targetVersionId))
      .limit(1);

    if (!target) {
      return { ok: false, error: `Target prompt version ${targetVersionId} not found.` };
    }

    if (target.promptKey !== promptKey) {
      return { ok: false, error: `Prompt key mismatch: target version belongs to "${target.promptKey}", expected "${promptKey}".` };
    }

    if (brandId && target.brandId !== brandId) {
      return { ok: false, error: `Tenant isolation violation: target prompt version belongs to another brand.` };
    }

    // Deactivate currently active versions for key & brand scope
    await db
      .update(promptVersions)
      .set({ isActive: false })
      .where(
        brandId
          ? and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.brandId, brandId))
          : eq(promptVersions.promptKey, promptKey),
      );

    // Activate target version
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
