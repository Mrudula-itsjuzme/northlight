import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { aiPrompts, aiPlatforms, aiVisibilitySnapshots, brands } from "@/db/schema";
import { getAllVisibilityAdapters } from "@/lib/ai/visibility/registry";
import { AI_PLATFORM_KEYS, type AiPlatformKey } from "@/lib/ai/visibility/adapter";

async function ensurePlatformRows(): Promise<Record<AiPlatformKey, string>> {
  const db = getDb();
  const existing = await db.select().from(aiPlatforms);
  const byKey: Partial<Record<AiPlatformKey, string>> = {};
  for (const row of existing) {
    byKey[row.key as AiPlatformKey] = row.id;
  }

  const displayNames: Record<AiPlatformKey, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    perplexity: "Perplexity",
    copilot: "Copilot",
    ai_overviews: "AI Overviews",
  };

  for (const key of AI_PLATFORM_KEYS) {
    if (!byKey[key]) {
      const hasLiveAdapter = key === "chatgpt" && Boolean(process.env.OPENAI_API_KEY);
      const [inserted] = await db
        .insert(aiPlatforms)
        .values({ key, displayName: displayNames[key], hasLiveAdapter })
        .onConflictDoNothing()
        .returning({ id: aiPlatforms.id, key: aiPlatforms.key });
      if (inserted) {
        byKey[inserted.key as AiPlatformKey] = inserted.id;
      } else {
        const [reFetched] = await db.select().from(aiPlatforms).where(eq(aiPlatforms.key, key)).limit(1);
        if (reFetched) byKey[key] = reFetched.id;
      }
    }
  }

  return byKey as Record<AiPlatformKey, string>;
}

/**
 * Role-free core: runs a visibility snapshot for one prompt across all 6
 * platforms and persists one `ai_visibility_snapshots` row per platform.
 * Split out of the `"use server"` action (runVisibilitySnapshot in
 * actions.ts) so it can also be called directly by the background job
 * worker (Phase 12, `run_ai_visibility_snapshot` job type) — same
 * core/action split as persistGapReportsForCompetitor,
 * computeAndPersistRecommendations, runPipeline, generateContentBrief,
 * and processDocument.
 */
export async function persistVisibilitySnapshot(
  brandId: string,
  promptId: string,
): Promise<{ snapshotCount: number }> {
  const db = getDb();

  const [prompt] = await db
    .select()
    .from(aiPrompts)
    .where(and(eq(aiPrompts.id, promptId), eq(aiPrompts.brandId, brandId)))
    .limit(1);
  if (!prompt) throw new Error(`ai_prompts row ${promptId} not found for brand ${brandId}`);

  const [brand] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`brands row ${brandId} not found`);

  const platformIds = await ensurePlatformRows();
  const adapters = getAllVisibilityAdapters();

  const results = await Promise.all(
    adapters.map((adapter) => adapter.check(prompt.promptText, brand.name)),
  );

  await db.insert(aiVisibilitySnapshots).values(
    results.map((result) => ({
      brandId,
      promptId,
      platformId: platformIds[result.platform],
      mentioned: result.mentioned,
      position: result.position,
      sentiment: result.sentiment,
      confidence: result.confidence,
      rawResponse: result.rawResponse,
      isDemo: result.isDemo,
    })),
  );

  return { snapshotCount: results.length };
}
