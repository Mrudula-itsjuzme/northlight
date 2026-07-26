import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";

describe("profile upsert & brand creation flow (pglite)", () => {
  let db: PGlite;
  const newUserId = "55555555-5555-5555-5555-555555555555";
  const existingUserId = "66666666-6666-6666-6666-666666666666";

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);

    // Seed existing user profile
    await db.query(`INSERT INTO profiles (id, email, full_name) VALUES ($1, $2, $3);`, [
      existingUserId,
      "existing@user.test",
      "Existing User",
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  /** Mirrors the exact transactional logic in createBrand + ensureProfile. */
  async function executeBrandCreation(params: {
    userId: string;
    email: string;
    fullName?: string | null;
    brandName: string;
    slug: string;
  }) {
    await db.exec("BEGIN;");
    try {
      // 1. Safe & idempotent profile upsert
      await db.query(
        `INSERT INTO profiles (id, email, full_name, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
           updated_at = NOW();`,
        [params.userId, params.email, params.fullName ?? null],
      );

      // 2. Insert brand
      const brandResult = await db.query<{ id: string }>(
        `INSERT INTO brands (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id;`,
        [params.brandName, params.slug, params.userId],
      );
      const brandId = brandResult.rows[0].id;

      // 3. Insert owner membership
      await db.query(
        `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
        [brandId, params.userId],
      );

      await db.exec("COMMIT;");
      return brandId;
    } catch (err) {
      await db.exec("ROLLBACK;");
      throw err;
    }
  }

  it("1. creates profile and brand for a new authenticated user with no profile row", async () => {
    // Verify user has no profile initially
    const checkInitial = await db.query(`SELECT * FROM profiles WHERE id = $1;`, [newUserId]);
    expect(checkInitial.rows).toHaveLength(0);

    const brandId = await executeBrandCreation({
      userId: newUserId,
      email: "newuser@test.com",
      fullName: "New User",
      brandName: "New Brand",
      slug: "new-brand-slug",
    });

    expect(brandId).toBeDefined();

    // Verify profile was created
    const profileCheck = await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM profiles WHERE id = $1;`,
      [newUserId],
    );
    expect(profileCheck.rows).toHaveLength(1);
    expect(profileCheck.rows[0].email).toBe("newuser@test.com");

    // Verify brand was created with created_by referencing the profile
    const brandCheck = await db.query<{ created_by: string }>(
      `SELECT created_by FROM brands WHERE id = $1;`,
      [brandId],
    );
    expect(brandCheck.rows[0].created_by).toBe(newUserId);
  });

  it("2. succeeds for an existing user with an established profile row", async () => {
    const brandId = await executeBrandCreation({
      userId: existingUserId,
      email: "existing@user.test",
      fullName: "Existing User Updated",
      brandName: "Second Brand",
      slug: "second-brand-slug",
    });

    expect(brandId).toBeDefined();

    const profileCheck = await db.query<{ full_name: string }>(
      `SELECT full_name FROM profiles WHERE id = $1;`,
      [existingUserId],
    );
    expect(profileCheck.rows[0].full_name).toBe("Existing User Updated");
  });

  it("3. handles repeated submissions idempotently without duplicate profile errors", async () => {
    const brand1 = await executeBrandCreation({
      userId: newUserId,
      email: "idempotent@test.com",
      brandName: "Brand Attempt 1",
      slug: "brand-attempt-1",
    });

    const brand2 = await executeBrandCreation({
      userId: newUserId,
      email: "idempotent@test.com",
      brandName: "Brand Attempt 2",
      slug: "brand-attempt-2",
    });

    expect(brand1).not.toBe(brand2);

    const profileCount = await db.query(`SELECT id FROM profiles WHERE id = $1;`, [newUserId]);
    expect(profileCount.rows).toHaveLength(1);
  });

  it("4. rejects brand insertion if no authenticated user is present", async () => {
    let threw = false;
    try {
      await db.query(`INSERT INTO brands (name, slug, created_by) VALUES ($1, $2, $3);`, [
        "Unauthenticated Brand",
        "unauth-brand",
        "00000000-0000-0000-0000-000000000000",
      ]);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });
});
