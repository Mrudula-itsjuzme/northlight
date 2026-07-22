"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { recommendations } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { computeAndPersistRecommendations } from "@/lib/recommendations/compute-core";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/**
 * Recomputes recommendations for a brand: gathers real signals from
 * keywords/gap-reports/articles/visibility-snapshots, ranks them via the
 * pure `rankRecommendations` function, and replaces the brand's prior
 * recommendation set (a full recompute rather than an incremental merge,
 * since ranking is relative to the CURRENT full signal set — the same
 * "full recompute, not incremental" approach Phase 5 uses for keyword
 * clusters). The actual gather/rank/persist logic lives in
 * compute-core.ts so the background job worker can call it directly.
 */
export async function computeRecommendations(
  brandId: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const result = await computeAndPersistRecommendations(brandId);
    revalidatePath("/recommendations");
    return { ok: true, data: result };
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
