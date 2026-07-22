import "server-only";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { JOB_PAYLOAD_SCHEMAS, type JobType, type JobPayloadFor } from "@/lib/jobs/types";

/**
 * Enqueues one job row for the worker to pick up later. Validates the
 * payload against the matching Zod schema (src/lib/validation/jobs.ts)
 * BEFORE insert, so a malformed enqueue call fails immediately at the
 * call site rather than producing a job row the worker can never
 * process. `brandId` is stored on the row itself (not just inside the
 * payload) so usage-event recording and per-brand job-status queries
 * (Analytics/Jobs surfaces) don't need to parse the payload.
 */
export async function enqueueJob<T extends JobType>(
  type: T,
  brandId: string | null,
  payload: JobPayloadFor<T>,
  options?: { runAt?: Date; maxAttempts?: number },
): Promise<{ id: string }> {
  const validated = JOB_PAYLOAD_SCHEMAS[type].parse(payload);
  const db = getDb();

  const [row] = await db
    .insert(jobs)
    .values({
      brandId,
      type,
      payload: validated,
      runAt: options?.runAt ?? new Date(),
      maxAttempts: options?.maxAttempts ?? 3,
    })
    .returning({ id: jobs.id });

  return row;
}
