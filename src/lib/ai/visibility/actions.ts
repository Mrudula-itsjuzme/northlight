"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { aiPrompts, aiPlatforms, aiVisibilitySnapshots } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { aiPromptSchema, type AiPromptInput } from "@/lib/validation/ai-prompts";
import { persistVisibilitySnapshot } from "@/lib/ai/visibility/persist-snapshot";
import type { ActionResult } from "@/lib/brands/types";
import { checkRateLimit } from "@/lib/rate-limit";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function createAiPrompt(
  brandId: string,
  input: AiPromptInput,
): Promise<ActionResult<{ promptId: string }>> {
  const parsed = aiPromptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [prompt] = await db
      .insert(aiPrompts)
      .values({ brandId, promptText: parsed.data.promptText })
      .returning({ id: aiPrompts.id });

    revalidatePath("/visibility");
    return { ok: true, data: { promptId: prompt.id } };
  } catch (err) {
    return toActionError(err, "Failed to create prompt.");
  }
}

export async function deleteAiPrompt(brandId: string, promptId: string): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .update(aiPrompts)
      .set({ isActive: false })
      .where(and(eq(aiPrompts.id, promptId), eq(aiPrompts.brandId, brandId)));

    revalidatePath("/visibility");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to remove prompt.");
  }
}

export type AiPromptItem = {
  id: string;
  promptText: string;
  isActive: boolean;
};

export async function listAiPrompts(brandId: string): Promise<ActionResult<AiPromptItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select()
      .from(aiPrompts)
      .where(and(eq(aiPrompts.brandId, brandId), eq(aiPrompts.isActive, true)))
      .orderBy(desc(aiPrompts.createdAt));

    return { ok: true, data: rows.map((r) => ({ id: r.id, promptText: r.promptText, isActive: r.isActive })) };
  } catch (err) {
    return toActionError(err, "Failed to list prompts.");
  }
}

/**
 * Runs a visibility snapshot for one prompt across all 6 platforms
 * (demo adapters for every platform except ChatGPT when
 * `OPENAI_API_KEY` is configured), persisting one
 * `ai_visibility_snapshots` row per platform. The actual adapter-calling
 * and persistence logic lives in persist-snapshot.ts so the background
 * job worker can call it directly.
 */
export async function runVisibilitySnapshot(
  brandId: string,
  promptId: string,
): Promise<ActionResult<{ snapshotCount: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const limit = checkRateLimit("visibilitySnapshot", brandId);
    if (!limit.ok) return limit;
    const result = await persistVisibilitySnapshot(brandId, promptId);
    revalidatePath("/visibility");
    return { ok: true, data: result };
  } catch (err) {
    return toActionError(err, "Failed to run visibility snapshot.");
  }
}

export type VisibilitySnapshotItem = {
  id: string;
  promptId: string;
  platformKey: string;
  platformDisplayName: string;
  mentioned: boolean;
  position: number | null;
  sentiment: string;
  confidence: number | null;
  isDemo: boolean;
  createdAt: Date;
};

export async function listVisibilitySnapshots(
  brandId: string,
): Promise<ActionResult<VisibilitySnapshotItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const rows = await db
      .select({
        id: aiVisibilitySnapshots.id,
        promptId: aiVisibilitySnapshots.promptId,
        mentioned: aiVisibilitySnapshots.mentioned,
        position: aiVisibilitySnapshots.position,
        sentiment: aiVisibilitySnapshots.sentiment,
        confidence: aiVisibilitySnapshots.confidence,
        isDemo: aiVisibilitySnapshots.isDemo,
        createdAt: aiVisibilitySnapshots.createdAt,
        platformKey: aiPlatforms.key,
        platformDisplayName: aiPlatforms.displayName,
      })
      .from(aiVisibilitySnapshots)
      .innerJoin(aiPlatforms, eq(aiVisibilitySnapshots.platformId, aiPlatforms.id))
      .where(eq(aiVisibilitySnapshots.brandId, brandId))
      .orderBy(desc(aiVisibilitySnapshots.createdAt));

    return { ok: true, data: rows };
  } catch (err) {
    return toActionError(err, "Failed to list visibility snapshots.");
  }
}
