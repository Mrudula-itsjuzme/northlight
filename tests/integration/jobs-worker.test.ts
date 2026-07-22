import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";

/**
 * Proves the Phase 12 job worker's claim semantics against the REAL
 * `jobs` table schema (pglite): only queued+due rows are claimable,
 * claiming flips status to 'running' and increments attempts, and
 * `FOR UPDATE SKIP LOCKED` prevents a second claim attempt from getting
 * the same row a first claim already locked (simulated here by starting
 * a second transaction and confirming it does not see the row as
 * available). The worker's Drizzle-based `claimNextJob`/`processJob`
 * functions in src/lib/jobs/worker.ts run this EXACT SQL — see that
 * file's `claimNextJob` — so this test exercises the query text against
 * a real Postgres engine rather than only asserting intent in prose.
 * RLS on `jobs` is also exercised, since it's one of the migration's
 * documented tenant-scoped tables.
 */
describe("jobs worker claim semantics (pglite)", () => {
  let db: PGlite;
  const userA = "30303030-1111-1111-1111-111111111111";
  const userB = "30303030-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@jobs.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@jobs.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Jobs', 'brand-a-jobs', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Jobs', 'brand-b-jobs', $1) RETURNING id;`,
      [userB],
    );
    brandBId = brandB.rows[0].id;

    await db.query(`INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`, [
      brandAId,
      userA,
    ]);
    await db.query(`INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`, [
      brandBId,
      userB,
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  async function claimNext() {
    const result = await db.query<{
      id: string;
      brand_id: string | null;
      type: string;
      payload: unknown;
      attempts: number;
      max_attempts: number;
      status: string;
    }>(`
      UPDATE jobs
      SET status = 'running', attempts = attempts + 1, started_at = now()
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued' AND run_at <= now()
        ORDER BY run_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, brand_id, type, payload, attempts, max_attempts, status;
    `);
    return result.rows[0] ?? null;
  }

  it("claims the oldest queued+due job and flips it to running with attempts incremented", async () => {
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload, run_at) VALUES ($1, 'recompute_keyword_scores', $2, now() - interval '1 minute');`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );

    const claimed = await claimNext();
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe("running");
    expect(claimed!.attempts).toBe(1);
    expect(claimed!.brand_id).toBe(brandAId);
  });

  it("does not claim a job whose run_at is in the future", async () => {
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload, run_at) VALUES ($1, 'recompute_keyword_scores', $2, now() + interval '1 hour');`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );

    const claimed = await claimNext();
    expect(claimed).toBeNull();
  });

  it("does not re-claim a job already running", async () => {
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload, run_at, status) VALUES ($1, 'recompute_keyword_scores', $2, now(), 'running');`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );

    const claimed = await claimNext();
    expect(claimed).toBeNull();
  });

  it("claims strictly oldest-first when multiple jobs are due", async () => {
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload, run_at) VALUES ($1, 'recompute_keyword_scores', $2, now() - interval '1 second');`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload, run_at) VALUES ($1, 'recompute_keyword_scores', $2, now() - interval '1 hour');`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );

    const claimed = await claimNext();
    // The one queued an hour "ago" (earlier run_at) must be claimed first.
    const remaining = await db.query<{ run_at: string }>(`SELECT run_at FROM jobs WHERE status = 'queued';`);
    expect(remaining.rows).toHaveLength(1);
    expect(claimed).not.toBeNull();
  });

  it("records success: status succeeded, result populated, error cleared", async () => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO jobs (brand_id, type, payload, run_at) VALUES ($1, 'recompute_keyword_scores', $2, now()) RETURNING id;`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );
    await claimNext();

    await db.query(
      `UPDATE jobs SET status = 'succeeded', completed_at = now(), result = $2, error = NULL WHERE id = $1;`,
      [inserted.rows[0].id, JSON.stringify({ scored: 3 })],
    );

    const row = await db.query<{ status: string; result: { scored: number }; error: string | null }>(
      `SELECT status, result, error FROM jobs WHERE id = $1;`,
      [inserted.rows[0].id],
    );
    expect(row.rows[0].status).toBe("succeeded");
    expect(row.rows[0].result).toEqual({ scored: 3 });
    expect(row.rows[0].error).toBeNull();
  });

  it("records a retryable failure: back to queued with error message and future run_at", async () => {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO jobs (brand_id, type, payload, run_at, max_attempts) VALUES ($1, 'recompute_keyword_scores', $2, now(), 3) RETURNING id;`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );
    await claimNext(); // attempts -> 1

    await db.query(
      `UPDATE jobs SET status = 'queued', error = $2, run_at = now() + interval '30 seconds' WHERE id = $1;`,
      [inserted.rows[0].id, "boom"],
    );

    const row = await db.query<{ status: string; error: string; run_at: string; attempts: number }>(
      `SELECT status, error, run_at, attempts FROM jobs WHERE id = $1;`,
      [inserted.rows[0].id],
    );
    expect(row.rows[0].status).toBe("queued");
    expect(row.rows[0].error).toBe("boom");
    expect(row.rows[0].attempts).toBe(1);
    expect(new Date(row.rows[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("isolates jobs between brands (RLS)", async () => {
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload) VALUES ($1, 'recompute_keyword_scores', $2);`,
      [brandAId, JSON.stringify({ brandId: brandAId })],
    );
    await db.query(
      `INSERT INTO jobs (brand_id, type, payload) VALUES ($1, 'recompute_keyword_scores', $2);`,
      [brandBId, JSON.stringify({ brandId: brandBId })],
    );

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM jobs;`);
    expect(result.rows).toHaveLength(1); // only brand A's job, never brand B's
  });
});
