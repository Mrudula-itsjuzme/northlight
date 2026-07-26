import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { JOB_PAYLOAD_SCHEMAS, type JobType, type JobPayloadFor } from "@/lib/jobs/types";

/**
 * Enqueues one job row for the worker to pick up later. Validates the
 * payload against the matching Zod schema BEFORE insert. Supports idempotencyKey
 * to prevent duplicate jobs from being queued while an existing run is queued or active.
 */
export async function enqueueJob<T extends JobType>(
  type: T,
  brandId: string | null,
  payload: JobPayloadFor<T>,
  options?: { runAt?: Date; maxAttempts?: number; idempotencyKey?: string },
): Promise<{ id: string; deduplicated?: boolean }> {
  const validated = JOB_PAYLOAD_SCHEMAS[type].parse(payload);
  const db = getDb();

  if (options?.idempotencyKey) {
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.idempotencyKey, options.idempotencyKey),
          inArray(jobs.status, ["queued", "running"]),
        ),
      )
      .limit(1);

    if (existing) {
      return { id: existing.id, deduplicated: true };
    }
  }

  const [row] = await db
    .insert(jobs)
    .values({
      brandId,
      type,
      payload: validated,
      runAt: options?.runAt ?? new Date(),
      maxAttempts: options?.maxAttempts ?? 3,
      idempotencyKey: options?.idempotencyKey ?? null,
    })
    .returning({ id: jobs.id });

  return { id: row.id, deduplicated: false };
}
