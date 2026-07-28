import "server-only";
import { eq, and, inArray, sql } from "drizzle-orm";
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

  try {
    if (options?.idempotencyKey) {
      try {
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
      } catch {
        // Skip idempotency check if column does not exist on DB
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;

    if (code === "42703" || message.includes("locked_at") || message.includes("idempotency_key")) {
      try {
        await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone;`);
        await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS locked_by text;`);
        await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;`);
        await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key text;`);

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
      } catch {
        const rows = await db.execute<{ id: string }>(sql`
          INSERT INTO jobs (brand_id, type, payload, run_at, max_attempts)
          VALUES (${brandId}, ${type}, ${JSON.stringify(validated)}::jsonb, ${options?.runAt ?? new Date()}, ${options?.maxAttempts ?? 3})
          RETURNING id
        `);

        return { id: rows[0].id, deduplicated: false };
      }
    }
    throw err;
  }
}
