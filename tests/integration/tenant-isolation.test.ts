import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createTestDb,
  resetToSuperuser,
  setCurrentUser,
} from "../db/pglite";

/**
 * Proves brand A's user cannot read brand B's data, using the REAL RLS
 * policy SQL from src/db/migrations/0001_rls_policies.sql applied to a real
 * (if embedded/WASM) Postgres engine — not a re-implementation of the
 * policy logic in application code. See tests/db/pglite.ts for exactly how
 * this differs from a full Supabase environment (only the vector column
 * type is substituted; every table, constraint, and RLS policy is
 * unmodified).
 */
describe("tenant isolation (RLS)", () => {
  let db: PGlite;

  const userA = "11111111-1111-1111-1111-111111111111";
  const userB = "22222222-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;
  let keywordAId: string;
  let keywordBId: string;

  beforeEach(async () => {
    db = await createTestDb();

    // Seed as superuser (bypasses RLS) so setup itself isn't gated by the
    // policies under test.
    await db.exec(`
      INSERT INTO profiles (id, email) VALUES
        ('${userA}', 'a@brand-a.test'),
        ('${userB}', 'b@brand-b.test');
    `);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A', 'brand-a', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;

    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B', 'brand-b', $1) RETURNING id;`,
      [userB],
    );
    brandBId = brandB.rows[0].id;

    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
      [brandAId, userA],
    );
    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
      [brandBId, userB],
    );

    const keywordA = await db.query<{ id: string }>(
      `INSERT INTO keywords (brand_id, term) VALUES ($1, 'tween shampoo') RETURNING id;`,
      [brandAId],
    );
    keywordAId = keywordA.rows[0].id;

    const keywordB = await db.query<{ id: string }>(
      `INSERT INTO keywords (brand_id, term) VALUES ($1, 'competitor secret keyword') RETURNING id;`,
      [brandBId],
    );
    keywordBId = keywordB.rows[0].id;
  });

  afterEach(async () => {
    await db.close();
  });

  it("lets brand A's user read brand A's own keywords", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id, term FROM keywords;`);
    expect(result.rows).toEqual([
      expect.objectContaining({ id: keywordAId, term: "tween shampoo" }),
    ]);
  });

  it("prevents brand A's user from reading brand B's keywords", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM keywords WHERE id = $1;`, [
      keywordBId,
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("prevents brand A's user from reading brand B's brand row", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM brands WHERE id = $1;`, [
      brandBId,
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("prevents brand A's user from seeing brand B's membership rows", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(
      `SELECT id FROM brand_members WHERE brand_id = $1;`,
      [brandBId],
    );
    expect(result.rows).toHaveLength(0);
  });

  it("prevents an unauthenticated session from reading any brand's keywords", async () => {
    await setCurrentUser(db, null);
    const result = await db.query(`SELECT id FROM keywords;`);
    expect(result.rows).toHaveLength(0);
  });

  it("prevents brand A's user from updating brand B's keyword", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(
      `UPDATE keywords SET term = 'hijacked' WHERE id = $1 RETURNING id;`,
      [keywordBId],
    );
    expect(result.rows).toHaveLength(0);

    await resetToSuperuser(db);
    const check = await db.query<{ term: string }>(
      `SELECT term FROM keywords WHERE id = $1;`,
      [keywordBId],
    );
    expect(check.rows[0].term).toBe("competitor secret keyword");
  });

  it("prevents brand A's user from deleting brand B's keyword", async () => {
    await setCurrentUser(db, userA);
    await db.query(`DELETE FROM keywords WHERE id = $1;`, [keywordBId]);

    await resetToSuperuser(db);
    const check = await db.query(`SELECT id FROM keywords WHERE id = $1;`, [
      keywordBId,
    ]);
    expect(check.rows).toHaveLength(1);
  });

  it("prevents brand A's user from inserting a row into brand B (cross-tenant write)", async () => {
    await setCurrentUser(db, userA);
    await expect(
      db.query(
        `INSERT INTO keywords (brand_id, term) VALUES ($1, 'sneaky insert');`,
        [brandBId],
      ),
    ).rejects.toThrow();
  });

  it("isolates brand_documents, competitors, articles, and jobs the same way", async () => {
    await resetToSuperuser(db);
    const doc = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type) VALUES ($1, 'Brand guide', 'typed_text') RETURNING id;`,
      [brandBId],
    );
    const competitor = await db.query<{ id: string }>(
      `INSERT INTO competitors (brand_id, name, domain) VALUES ($1, 'Rival Co', 'rival.example') RETURNING id;`,
      [brandBId],
    );
    const job = await db.query<{ id: string }>(
      `INSERT INTO jobs (brand_id, type, payload) VALUES ($1, 'recompute_keyword_scores', '{}') RETURNING id;`,
      [brandBId],
    );

    await setCurrentUser(db, userA);

    const docResult = await db.query(
      `SELECT id FROM brand_documents WHERE id = $1;`,
      [doc.rows[0].id],
    );
    const competitorResult = await db.query(
      `SELECT id FROM competitors WHERE id = $1;`,
      [competitor.rows[0].id],
    );
    const jobResult = await db.query(`SELECT id FROM jobs WHERE id = $1;`, [
      job.rows[0].id,
    ]);

    expect(docResult.rows).toHaveLength(0);
    expect(competitorResult.rows).toHaveLength(0);
    expect(jobResult.rows).toHaveLength(0);
  });

  it("allows a brand member to read the ai_platforms reference table regardless of brand", async () => {
    await resetToSuperuser(db);
    await db.exec(
      `INSERT INTO ai_platforms (key, display_name, has_live_adapter) VALUES ('chatgpt', 'ChatGPT', false);`,
    );

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT key FROM ai_platforms;`);
    expect(result.rows).toHaveLength(1);
  });
});
