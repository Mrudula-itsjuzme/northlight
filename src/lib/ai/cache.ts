import "server-only";
import { createHash } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiSemanticCache,
  campaignMemories,
  knowledgeGraphNodes,
  promptVersions,
} from "@/db/schema";
import { brandDocuments } from "@/db/schema/brand-setup";

export type CacheLookupInput = {
  brandId: string;
  stage: string;
  promptVersion: string;
  brandBrainRevision?: string;
  campaignMemoryRevision?: string;
  knowledgeGraphRevision?: string;
  executionMode: string;
  model: string;
  provider: string;
  requestPayload: unknown;
  retrievedChunkIds?: string[];
  retrievedChunkVersions?: string[];
  upstreamOutputs?: Record<string, unknown>;
  configVersions?: Record<string, string>;
  ttlSeconds?: number;
};

/**
 * Computes real database-backed Brand Brain document revision hash.
 */
export async function getBrandBrainRevision(brandId: string): Promise<string> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ maxUpdated: sql<string>`coalesce(max(${brandDocuments.updatedAt})::text, 'none')` })
      .from(brandDocuments)
      .where(eq(brandDocuments.brandId, brandId));
    return createHash("sha256").update(row?.maxUpdated || "none").digest("hex").slice(0, 16);
  } catch {
    return "bb_v1";
  }
}

/**
 * Computes real database-backed active Campaign Memory revision hash.
 */
export async function getCampaignMemoryRevision(brandId: string): Promise<string> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ maxUpdated: sql<string>`coalesce(max(${campaignMemories.updatedAt})::text, 'none')` })
      .from(campaignMemories)
      .where(and(eq(campaignMemories.brandId, brandId), eq(campaignMemories.isActive, true)));
    return createHash("sha256").update(row?.maxUpdated || "none").digest("hex").slice(0, 16);
  } catch {
    return "cm_v1";
  }
}

/**
 * Computes real database-backed Knowledge Graph revision hash.
 */
export async function getKnowledgeGraphRevision(brandId: string): Promise<string> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeGraphNodes)
      .where(eq(knowledgeGraphNodes.brandId, brandId));
    return createHash("sha256").update(`kg:${row?.count || 0}`).digest("hex").slice(0, 16);
  } catch {
    return "kg_v1";
  }
}

/**
 * Computes real database-backed Active Prompt version revision string.
 */
export async function getActivePromptRevision(promptKey: string, brandId?: string): Promise<string> {
  try {
    const db = getDb();
    const query = brandId
      ? db
          .select({ id: promptVersions.id, version: promptVersions.version })
          .from(promptVersions)
          .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.brandId, brandId), eq(promptVersions.isActive, true)))
      : db
          .select({ id: promptVersions.id, version: promptVersions.version })
          .from(promptVersions)
          .where(and(eq(promptVersions.promptKey, promptKey), eq(promptVersions.isActive, true)));

    const [row] = await query.limit(1);
    return row ? `${row.id}:${row.version}` : "prompt_v1";
  } catch {
    return "prompt_v1";
  }
}

/**
 * Returns deterministic pipeline configuration revision string per stage.
 */
export function getPipelineConfigRevision(stage: string): string {
  const norm = normalizeCacheStage(stage);
  return createHash("sha256").update(`cfg:${norm}:v2.0.0`).digest("hex").slice(0, 16);
}

/**
 * Recursively canonicalizes JSON values by sorting object keys alphabetically.
 * Ensures deterministic stringification regardless of property insertion order.
 */
export function canonicalizeJsonPayload(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeJsonPayload);
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = canonicalizeJsonPayload(obj[k]);
  }
  return sortedObj;
}

/**
 * Normalizes stage key name (lowercase, trimmed, hyphens replaced with underscores).
 */
export function normalizeCacheStage(stage: string): string {
  return String(stage || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");
}

/**
 * Computes deterministic SHA256 hash key for semantic cache matching incorporating all revisions & retrieved chunks.
 */
export function computeCacheHash(input: CacheLookupInput): string {
  const normalizedStage = normalizeCacheStage(input.stage);
  const canonicalPayload = JSON.stringify({
    brandId: input.brandId,
    stage: normalizedStage,
    promptVersion: input.promptVersion,
    brandBrainRevision: input.brandBrainRevision || "v1",
    campaignMemoryRevision: input.campaignMemoryRevision || "v1",
    knowledgeGraphRevision: input.knowledgeGraphRevision || "v1",
    executionMode: input.executionMode,
    model: input.model,
    provider: input.provider,
    retrievedChunkIds: [...(input.retrievedChunkIds || [])].sort(),
    retrievedChunkVersions: [...(input.retrievedChunkVersions || [])].sort(),
    upstreamOutputs: canonicalizeJsonPayload(input.upstreamOutputs || {}),
    configVersions: canonicalizeJsonPayload(input.configVersions || {}),
    payload: canonicalizeJsonPayload(input.requestPayload),
  });
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

/**
 * Retrieves cached LLM stage output if hit exists and is valid.
 * Strictly scopes by requestHash & brandId, and respects expiresAt expiration timestamp.
 */
export async function getCachedLlmOutput<T extends Record<string, unknown>>(
  input: CacheLookupInput,
): Promise<{ hit: boolean; data?: T; tokensSaved?: number; costSavedCents?: number }> {
  const hash = computeCacheHash(input);

  try {
    const db = getDb();
    const [entry] = await db
      .select()
      .from(aiSemanticCache)
      .where(and(eq(aiSemanticCache.requestHash, hash), eq(aiSemanticCache.brandId, input.brandId)))
      .limit(1);

    if (!entry) return { hit: false };

    // Check expiration timestamp if set
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) {
      return { hit: false };
    }

    // Increment hit count asynchronously without blocking or failing read on error
    db.update(aiSemanticCache)
      .set({
        hitCount: sql`${aiSemanticCache.hitCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(aiSemanticCache.id, entry.id))
      .catch(() => {});

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
 * Stores LLM stage output in semantic cache with optional expiration TTL.
 */
export async function setCachedLlmOutput(
  input: CacheLookupInput,
  response: Record<string, unknown>,
  tokensSaved = 0,
  costSavedCents = 0,
): Promise<void> {
  const hash = computeCacheHash(input);
  const normalizedStage = normalizeCacheStage(input.stage);
  const expiresAt = input.ttlSeconds ? new Date(Date.now() + input.ttlSeconds * 1000) : null;

  try {
    const db = getDb();
    await db
      .insert(aiSemanticCache)
      .values({
        requestHash: hash,
        brandId: input.brandId,
        stage: normalizedStage,
        promptVersion: input.promptVersion,
        brandBrainRevision: input.brandBrainRevision || "v1",
        executionMode: input.executionMode,
        model: input.model,
        provider: input.provider,
        cachedResponse: response,
        tokensSaved,
        costSavedCents,
        hitCount: 1,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: aiSemanticCache.requestHash,
        set: {
          cachedResponse: response,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  } catch {
    // Gracefully ignore cache write errors
  }
}

/**
 * Selective invalidation for a brand's cache, with optional stage filtering.
 */
export async function invalidateBrandCache(brandId: string, stage?: string): Promise<void> {
  try {
    const db = getDb();
    if (stage) {
      const normalizedStage = normalizeCacheStage(stage);
      await db
        .delete(aiSemanticCache)
        .where(and(eq(aiSemanticCache.brandId, brandId), eq(aiSemanticCache.stage, normalizedStage)));
    } else {
      await db.delete(aiSemanticCache).where(eq(aiSemanticCache.brandId, brandId));
    }
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
  try {
    const db = getDb();
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
