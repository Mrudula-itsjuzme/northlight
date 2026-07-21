import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { roleAtLeast, type BrandRole } from "@/lib/validation/brands";

/**
 * Integration-style coverage for Phase 2's brand-creation/role-gating
 * acceptance criterion: "a user can create two brands, brand_members rows
 * are correct, and a non-owner cannot perform an owner-gated action" —
 * exercised against the REAL schema + RLS policies via pglite (same harness
 * as tests/integration/tenant-isolation.test.ts), not a re-implementation.
 *
 * `src/lib/brands/actions.ts` and `src/lib/brands/require-role.ts` connect
 * to Postgres via Drizzle's `postgres-js` driver (a real TCP client), which
 * cannot attach to pglite's in-process WASM engine directly. So this test
 * exercises the exact SQL shape those functions issue (the same
 * insert-brand + insert-brand_members transaction pattern `createBrand`
 * uses, and the same `SELECT role FROM brand_members WHERE brand_id = ...
 * AND user_id = ...` shape `requireRole` uses) against the real database,
 * and combines it with the actual `roleAtLeast` function (unit-tested
 * separately in tests/unit/roles.test.ts) to prove the end-to-end
 * authorization decision is correct. This mirrors how Phase 1 validated RLS
 * without a live Supabase project — see DATABASE.md.
 */
describe("brand creation & membership (pglite)", () => {
  let db: PGlite;
  const userId = "33333333-3333-3333-3333-333333333333";
  const otherUserId = "44444444-4444-4444-4444-444444444444";

  beforeEach(async () => {
    db = await createTestDb();
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, $2);`, [
      userId,
      "owner@brand.test",
    ]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, $2);`, [
      otherUserId,
      "member@brand.test",
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  /** Mirrors createBrand()'s transaction: insert brand, then owner membership. */
  async function createBrandAsOwner(name: string, slug: string, ownerId: string) {
    await db.exec("BEGIN;");
    try {
      const brand = await db.query<{ id: string }>(
        `INSERT INTO brands (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id;`,
        [name, slug, ownerId],
      );
      const brandId = brand.rows[0].id;
      await db.query(
        `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
        [brandId, ownerId],
      );
      await db.exec("COMMIT;");
      return brandId;
    } catch (err) {
      await db.exec("ROLLBACK;");
      throw err;
    }
  }

  it("lets a user create two brands, each with a correct owner brand_members row", async () => {
    await resetToSuperuser(db);

    const brand1Id = await createBrandAsOwner("Brand One", "brand-one", userId);
    const brand2Id = await createBrandAsOwner("Brand Two", "brand-two", userId);

    expect(brand1Id).not.toBe(brand2Id);

    const members = await db.query<{
      brand_id: string;
      user_id: string;
      role: string;
    }>(`SELECT brand_id, user_id, role FROM brand_members WHERE user_id = $1 ORDER BY brand_id;`, [
      userId,
    ]);

    expect(members.rows).toHaveLength(2);
    for (const row of members.rows) {
      expect(row.role).toBe("owner");
      expect([brand1Id, brand2Id]).toContain(row.brand_id);
    }

    // Confirm the user can see both via their own RLS-scoped session.
    await setCurrentUser(db, userId);
    const visibleBrands = await db.query(`SELECT id FROM brands;`);
    expect(visibleBrands.rows).toHaveLength(2);
  });

  it("rolls back the brand insert if the membership insert fails (transactional guarantee)", async () => {
    await resetToSuperuser(db);

    await db.exec("BEGIN;");
    let threw = false;
    try {
      const brand = await db.query<{ id: string }>(
        `INSERT INTO brands (name, slug, created_by) VALUES ('Broken Brand', 'broken-brand', $1) RETURNING id;`,
        [userId],
      );
      // Invalid role value simulates a failure partway through the
      // transaction (e.g. an unexpected error) — the brand insert above
      // must not survive if the second insert in the transaction fails.
      await db.query(
        `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'not-a-real-role');`,
        [brand.rows[0].id, userId],
      );
      await db.exec("COMMIT;");
    } catch {
      threw = true;
      await db.exec("ROLLBACK;");
    }

    expect(threw).toBe(true);

    const brandCheck = await db.query(
      `SELECT id FROM brands WHERE slug = 'broken-brand';`,
    );
    expect(brandCheck.rows).toHaveLength(0);
  });

  it("computes correct role-gating decisions for owner-gated actions using real brand_members rows", async () => {
    await resetToSuperuser(db);

    const brandId = await createBrandAsOwner("Gated Brand", "gated-brand", userId);
    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'editor');`,
      [brandId, otherUserId],
    );

    // Simulates exactly what requireRole() queries: SELECT role FROM
    // brand_members WHERE brand_id = ... AND user_id = ...
    async function roleFor(uid: string): Promise<BrandRole | null> {
      const result = await db.query<{ role: BrandRole }>(
        `SELECT role FROM brand_members WHERE brand_id = $1 AND user_id = $2;`,
        [brandId, uid],
      );
      return result.rows[0]?.role ?? null;
    }

    const ownerRole = await roleFor(userId);
    const editorRole = await roleFor(otherUserId);

    expect(ownerRole).toBe("owner");
    expect(editorRole).toBe("editor");

    // The owner-gated action (e.g. updateMemberRole requires "owner").
    expect(roleAtLeast(ownerRole!, "owner")).toBe(true);
    // The non-owner (editor) must be rejected for the same action.
    expect(roleAtLeast(editorRole!, "owner")).toBe(false);

    // And the admin-gated action (e.g. inviteMember requires "admin"):
    // an editor must also be rejected for that, since editor < admin.
    expect(roleAtLeast(editorRole!, "admin")).toBe(false);
  });

  it("prevents an editor from being counted as a member of a brand they were removed from", async () => {
    await resetToSuperuser(db);
    const brandId = await createBrandAsOwner("Removal Brand", "removal-brand", userId);
    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'editor');`,
      [brandId, otherUserId],
    );

    await db.query(
      `DELETE FROM brand_members WHERE brand_id = $1 AND user_id = $2;`,
      [brandId, otherUserId],
    );

    const result = await db.query(
      `SELECT role FROM brand_members WHERE brand_id = $1 AND user_id = $2;`,
      [brandId, otherUserId],
    );
    expect(result.rows).toHaveLength(0);
  });
});
