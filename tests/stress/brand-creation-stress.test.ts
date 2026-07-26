import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser } from "../db/pglite";

describe("Brand Creation & Profile Upsert Stress Test", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
  });

  afterEach(async () => {
    await db.close();
  });

  async function executeTransaction(userId: string, email: string, brandName: string, slug: string) {
    await db.exec("BEGIN;");
    try {
      await db.query(
        `INSERT INTO profiles (id, email, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();`,
        [userId, email],
      );

      const brandResult = await db.query<{ id: string }>(
        `INSERT INTO brands (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id;`,
        [brandName, slug, userId],
      );
      const brandId = brandResult.rows[0].id;

      await db.query(
        `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
        [brandId, userId],
      );

      await db.exec("COMMIT;");
      return brandId;
    } catch (err) {
      await db.exec("ROLLBACK;");
      throw err;
    }
  }

  it("handles 50 concurrent profile upserts for the exact same user without lock deadlocks", async () => {
    const targetUserId = "77777777-7777-7777-7777-777777777777";
    const email = "stresstest@northlight.dev";

    const promises = Array.from({ length: 50 }, (_, i) =>
      executeTransaction(targetUserId, email, `Stress Brand ${i}`, `stress-brand-${i}`),
    );

    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(fulfilled.length).toBe(50);

    const profileCheck = await db.query(`SELECT id FROM profiles WHERE id = $1;`, [targetUserId]);
    expect(profileCheck.rows).toHaveLength(1);

    const brandCheck = await db.query(`SELECT id FROM brands WHERE created_by = $1;`, [targetUserId]);
    expect(brandCheck.rows).toHaveLength(50);
  });

  it("handles high concurrency across multiple distinct users simultaneously", async () => {
    const concurrencyCount = 30;

    const promises = Array.from({ length: concurrencyCount }, (_, i) => {
      const uId = `88888888-8888-8888-8888-${String(i).padStart(12, "0")}`;
      return executeTransaction(uId, `user${i}@stress.com`, `Parallel Brand ${i}`, `parallel-brand-${i}`);
    });

    const results = await Promise.all(promises);
    expect(results).toHaveLength(concurrencyCount);

    const allBrands = await db.query(`SELECT id FROM brands;`);
    expect(allBrands.rows.length).toBeGreaterThanOrEqual(concurrencyCount);
  });
});
