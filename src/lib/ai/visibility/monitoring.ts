import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { aiVisibilitySnapshots, visibilityAlerts } from "@/db/schema";
import { persistVisibilitySnapshot } from "@/lib/ai/visibility/persist-snapshot";

export type RegressionCheckResult = {
  promptId: string;
  alertsCreated: number;
};

/**
 * Runs a continuous visibility check and detects position drops or lost brand mentions.
 */
export async function runContinuousVisibilityCheck(
  brandId: string,
  promptId: string,
): Promise<RegressionCheckResult> {
  const db = getDb();

  // 1. Get prior snapshot state before running new check
  const priorSnapshots = await db
    .select()
    .from(aiVisibilitySnapshots)
    .where(and(eq(aiVisibilitySnapshots.brandId, brandId), eq(aiVisibilitySnapshots.promptId, promptId)))
    .orderBy(desc(aiVisibilitySnapshots.createdAt))
    .limit(10);

  const priorMap = new Map<string, { mentioned: boolean; position: number | null }>();
  for (const s of priorSnapshots) {
    priorMap.set(s.platformId, { mentioned: s.mentioned, position: s.position });
  }

  // 2. Persist new snapshot
  await persistVisibilitySnapshot(brandId, promptId);

  // 3. Get latest snapshots to detect regressions
  const latestSnapshots = await db
    .select()
    .from(aiVisibilitySnapshots)
    .where(and(eq(aiVisibilitySnapshots.brandId, brandId), eq(aiVisibilitySnapshots.promptId, promptId)))
    .orderBy(desc(aiVisibilitySnapshots.createdAt))
    .limit(10);

  let alertsCreated = 0;
  for (const latest of latestSnapshots) {
    const prior = priorMap.get(latest.platformId);
    if (!prior) continue;

    // Detection Rule A: Brand mention lost
    if (prior.mentioned && !latest.mentioned) {
      await db.insert(visibilityAlerts).values({
        brandId,
        promptId,
        platformKey: latest.platformId,
        alertType: "mention_lost",
        previousPosition: prior.position,
        currentPosition: null,
        message: `Brand mention lost on platform ${latest.platformId}.`,
      });
      alertsCreated++;
    }

    // Detection Rule B: Position drop >= 2
    if (
      prior.position !== null &&
      latest.position !== null &&
      latest.position > prior.position + 1
    ) {
      await db.insert(visibilityAlerts).values({
        brandId,
        promptId,
        platformKey: latest.platformId,
        alertType: "rank_drop",
        previousPosition: prior.position,
        currentPosition: latest.position,
        message: `Visibility rank dropped from #${prior.position} to #${latest.position} on ${latest.platformId}.`,
      });
      alertsCreated++;
    }
  }

  return { promptId, alertsCreated };
}
