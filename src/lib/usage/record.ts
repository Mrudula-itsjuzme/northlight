import "server-only";
import { getDb } from "@/db";
import { usageEvents } from "@/db/schema";

/**
 * The fixed set of billable-ish action kinds this app tracks in
 * `usage_events`. Kept as a plain string union (not a DB enum) since
 * usage_events.event_type is `text` in the schema — new kinds can be
 * added without a migration, same rationale as `articleClaims`/
 * `recommendations` free-text status/source columns elsewhere.
 */
export type UsageEventType =
  | "embedding"
  | "content_pipeline_run"
  | "ai_visibility_check"
  | "gap_report_generation"
  | "keyword_rescore";

/**
 * Records one usage_events row for a billable-ish action. Called both
 * from the synchronous action paths (so usage is tracked even when a
 * user triggers work directly from the UI) and from the job worker (so
 * background-processed work is tracked identically) — the single place
 * "did this brand do a billable thing" is answered from, per the plan's
 * Phase 12 requirement. Never throws: usage tracking must not fail the
 * action it's recording.
 */
export async function recordUsageEvent(
  brandId: string,
  eventType: UsageEventType,
  quantity = 1,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(usageEvents).values({ brandId, eventType, quantity, metadata });
  } catch {
    // Usage tracking is best-effort observability, not a correctness
    // boundary — swallow errors so a usage-logging failure never blocks
    // the underlying billable action itself.
  }
}
