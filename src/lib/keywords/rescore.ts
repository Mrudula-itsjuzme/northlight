import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { keywords, keywordScores } from "@/db/schema";
import { scoreKeywordSet } from "@/lib/scoring/priority";

export const PRIORITY_FORMULA_VERSION = 1;

/**
 * Re-scores every keyword for a brand: reads all keywords, computes fresh
 * min-max normalization + priority scores across the current set (a
 * keyword's score can shift when siblings are added/removed, since
 * normalization is baseline-relative), writes the normalized/computed
 * values back onto each `keywords` row, and appends one row per keyword to
 * the append-only `keyword_scores` history table (never overwritten) so a
 * later formula change or re-baseline doesn't erase what a score used to
 * be. Called after CRUD/CSV-import changes to a brand's keyword set, and
 * by the `recompute_keyword_scores` job type (Phase 12) for background
 * re-scoring.
 */
export async function rescoreAllKeywords(brandId: string): Promise<{ scored: number }> {
  const db = getDb();

  const rows = await db
    .select({
      id: keywords.id,
      rawVolume: keywords.rawVolume,
      rawDifficulty: keywords.rawDifficulty,
      rawCommercialIntent: keywords.rawCommercialIntent,
      rawTrend: keywords.rawTrend,
      rawBusinessValue: keywords.rawBusinessValue,
    })
    .from(keywords)
    .where(eq(keywords.brandId, brandId));

  if (rows.length === 0) return { scored: 0 };

  const scored = scoreKeywordSet(
    rows.map((row) => ({
      id: row.id,
      rawVolume: row.rawVolume,
      rawDifficulty: row.rawDifficulty,
      commercialIntent: row.rawCommercialIntent,
      trend: row.rawTrend,
      businessValue: row.rawBusinessValue,
    })),
  );

  await db.transaction(async (tx) => {
    for (const result of scored) {
      await tx
        .update(keywords)
        .set({
          normalizedVolume: result.normalizedVolume,
          normalizedDifficulty: result.normalizedDifficulty,
          priorityScore: result.priorityScore,
          updatedAt: new Date(),
        })
        .where(eq(keywords.id, result.id));

      await tx.insert(keywordScores).values({
        brandId,
        keywordId: result.id,
        formulaVersion: PRIORITY_FORMULA_VERSION,
        normalizedVolume: result.normalizedVolume,
        normalizedDifficulty: result.normalizedDifficulty,
        commercialIntent: result.commercialIntent,
        trend: result.trend,
        businessValue: result.businessValue,
        priorityScore: result.priorityScore,
      });
    }
  });

  return { scored: scored.length };
}
