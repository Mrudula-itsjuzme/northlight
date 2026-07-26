import "server-only";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSemanticCache } from "@/db/schema";

export type CacheLookupInput = {
  brandId: string;
  stage: string;
  promptVersion: string;
  brandBrainRevision?: string;
  executionMode: string;
  model: string;
  provider: string;
  requestPayload: unknown;
};

/**
 * Computes deterministic SHA256 hash key for semantic cache matching.
 */
export function computeCacheHash(input: CacheLookupInput): string {
  const canonicalPayload = JSON.stringify({
    brandId: input.brandId,
    stage: input.stage,
    promptVersion: input.promptVersion,
    brandBrainRevision: input.brandBrainRevision || "v1",
    executionMode: input.executionMode,
    model: input.model,
    provider: input.provider,
    payload: input.requestPayload,
  });
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

/**
 * Retrieves cached LLM stage output if hit exists and is valid.
 */
export async function getCachedLlmOutput<T extends Record<string, unknown>>(
  input: CacheLookupInput,
): Promise<{ hit: boolean; data?: T; tokensSaved?: number; costSavedCents?: number }> {
  const hash = computeCacheHash(input);
  const db = getDb();

  try {
    const [entry] = await db
      .select()
      .from(aiSemanticCache)
      .where(eq(aiSemanticCache.requestHash, hash))
      .limit(1);

    if (!entry) return { hit: false };

    // Increment hit count asynchronously
    await db
      .update(aiSemanticCache)
      .set({
        hitCount: sql`${aiSemanticCache.hitCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(aiSemanticCache.id, entry.id));

    return {
      hit: true,
      data: entry.cachedResponse as T,
      tokensSaved: entry.tokensSaved,
      costSavedCents: entry.costSavedCents,
    };
  } catch {
    return { hit: false };
  }
}

/**
 * Stores LLM stage output in semantic cache.
 */
export async function setCachedLlmOutput(
  input: CacheLookupInput,
  response: Record<string, unknown>,
  tokensSaved = 0,
  costSavedCents = 0,
): Promise<void> {
  const hash = computeCacheHash(input);
  const db = getDb();

  try {
    await db
      .insert(aiSemanticCache)
      .values({
        requestHash: hash,
        brandId: input.brandId,
        stage: input.stage,
        promptVersion: input.promptVersion,
        brandBrainRevision: input.brandBrainRevision || "v1",
        executionMode: input.executionMode,
        model: input.model,
        provider: input.provider,
        cachedResponse: response,
        tokensSaved,
        costSavedCents,
        hitCount: 1,
      })
      .onConflictDoUpdate({
        target: aiSemanticCache.requestHash,
        set: {
          cachedResponse: response,
          updatedAt: new Date(),
        },
      });
  } catch {
    // Gracefully ignore cache write errors
  }
}

/**
 * Invalidates cache for a brand when brand brain documents or prompts change.
 */
export async function invalidateBrandCache(brandId: string): Promise<void> {
  const db = getDb();
  try {
    await db.delete(aiSemanticCache).where(eq(aiSemanticCache.brandId, brandId));
  } catch {
    // Silent fail
  }
}

/**
 * Computes semantic cache telemetry stats (hit rate, tokens saved, money saved).
 */
export async function getCacheMetrics(brandId?: string): Promise<{
  totalEntries: number;
  totalHits: number;
  totalTokensSaved: number;
  totalCostSavedCents: number;
}> {
  const db = getDb();
  try {
    const query = brandId
      ? db.select({
          entries: sql<number>`count(*)::int`,
          hits: sql<number>`coalesce(sum(${aiSemanticCache.hitCount}), 0)::int`,
          tokensSaved: sql<number>`coalesce(sum(${aiSemanticCache.tokensSaved} * ${aiSemanticCache.hitCount}), 0)::int`,
          costSavedCents: sql<number>`coalesce(sum(${aiSemanticCache.costSavedCents} * ${aiSemanticCache.hitCount}), 0)::int`,
        }).from(aiSemanticCache).where(eq(aiSemanticCache.brandId, brandId))
      : db.select({
          entries: sql<number>`count(*)::int`,
          hits: sql<number>`coalesce(sum(${aiSemanticCache.hitCount}), 0)::int`,
          tokensSaved: sql<number>`coalesce(sum(${aiSemanticCache.tokensSaved} * ${aiSemanticCache.hitCount}), 0)::int`,
          costSavedCents: sql<number>`coalesce(sum(${aiSemanticCache.costSavedCents} * ${aiSemanticCache.hitCount}), 0)::int`,
        }).from(aiSemanticCache);

    const [stats] = await query;

    return {
      totalEntries: stats?.entries || 0,
      totalHits: stats?.hits || 0,
      totalTokensSaved: stats?.tokensSaved || 0,
      totalCostSavedCents: stats?.costSavedCents || 0,
    };
  } catch {
    return { totalEntries: 0, totalHits: 0, totalTokensSaved: 0, totalCostSavedCents: 0 };
  }
}
