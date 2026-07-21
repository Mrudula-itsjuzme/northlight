import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser } from "../db/pglite";
import { canPublish, type ClaimForGate } from "@/lib/content/publish-gate";

/**
 * Proves Phase 8's publish-gate acceptance criterion against the real
 * schema: an article with an unresolved article_claims row cannot be
 * published; resolving or overriding it (with the full audit trail —
 * resolved_by/resolved_at or override_by/override_reason/override_at)
 * unblocks it, using the actual `canPublish` pure function (exhaustively
 * unit-tested in tests/unit/publish-gate.test.ts) against claim rows read
 * back from a real Postgres engine.
 */
describe("publish gate persistence (pglite)", () => {
  let db: PGlite;
  const owner = "eeeeeeee-1111-1111-1111-111111111111";
  const editor = "eeeeeeee-2222-2222-2222-222222222222";
  let brandId: string;
  let articleId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'owner@pg.test');`, [owner]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'editor@pg.test');`, [editor]);

    const brand = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand PG', 'brand-pg', $1) RETURNING id;`,
      [owner],
    );
    brandId = brand.rows[0].id;
    await db.query(`INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`, [
      brandId,
      owner,
    ]);
    await db.query(`INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'editor');`, [
      brandId,
      editor,
    ]);

    const article = await db.query<{ id: string }>(
      `INSERT INTO articles (brand_id, title, slug, status) VALUES ($1, 'Test Article', 'test-article', 'approved') RETURNING id;`,
      [brandId],
    );
    articleId = article.rows[0].id;
  });

  afterEach(async () => {
    await db.close();
  });

  async function claimsForGate(): Promise<ClaimForGate[]> {
    const result = await db.query<{ status: ClaimForGate["status"] }>(
      `SELECT status FROM article_claims WHERE article_id = $1;`,
      [articleId],
    );
    return result.rows;
  }

  it("blocks publish while an unresolved claim exists", async () => {
    await db.query(
      `INSERT INTO article_claims (brand_id, article_id, claim_text, status) VALUES ($1, $2, 'This product cures everything.', 'unresolved');`,
      [brandId, articleId],
    );

    const claims = await claimsForGate();
    const result = canPublish(claims, "editor", false);
    expect(result.canPublish).toBe(false);
  });

  it("blocks a non-owner (editor) attempting to override", async () => {
    await db.query(
      `INSERT INTO article_claims (brand_id, article_id, claim_text, status) VALUES ($1, $2, 'Unverified claim.', 'unresolved');`,
      [brandId, articleId],
    );
    const claims = await claimsForGate();
    // Editor role can never use the override path, regardless of intent.
    const result = canPublish(claims, "editor", true);
    expect(result.canPublish).toBe(false);
  });

  it("unblocks after the claim is resolved with a full audit trail", async () => {
    const claim = await db.query<{ id: string }>(
      `INSERT INTO article_claims (brand_id, article_id, claim_text, status) VALUES ($1, $2, 'Reviewed claim.', 'unresolved') RETURNING id;`,
      [brandId, articleId],
    );

    await db.query(
      `UPDATE article_claims SET status = 'resolved', resolution_note = $1, resolved_by = $2, resolved_at = now() WHERE id = $3;`,
      ["Verified against manufacturer spec sheet.", editor, claim.rows[0].id],
    );

    const stored = await db.query<{
      status: string;
      resolution_note: string;
      resolved_by: string;
      resolved_at: Date;
    }>(`SELECT status, resolution_note, resolved_by, resolved_at FROM article_claims WHERE id = $1;`, [
      claim.rows[0].id,
    ]);
    expect(stored.rows[0].status).toBe("resolved");
    expect(stored.rows[0].resolution_note).toBeTruthy();
    expect(stored.rows[0].resolved_by).toBe(editor);
    expect(stored.rows[0].resolved_at).not.toBeNull();

    const claims = await claimsForGate();
    expect(canPublish(claims, "editor", false).canPublish).toBe(true);
  });

  it("unblocks via a recorded owner override with a full audit trail", async () => {
    const claim = await db.query<{ id: string }>(
      `INSERT INTO article_claims (brand_id, article_id, claim_text, status) VALUES ($1, $2, 'Disputed claim.', 'unresolved') RETURNING id;`,
      [brandId, articleId],
    );

    await db.query(
      `UPDATE article_claims SET status = 'overridden', override_by = $1, override_reason = $2, override_at = now() WHERE id = $3;`,
      [owner, "Legal has reviewed and approved this claim despite lacking a public source.", claim.rows[0].id],
    );

    const stored = await db.query<{
      status: string;
      override_by: string;
      override_reason: string;
      override_at: Date;
    }>(`SELECT status, override_by, override_reason, override_at FROM article_claims WHERE id = $1;`, [
      claim.rows[0].id,
    ]);
    expect(stored.rows[0].status).toBe("overridden");
    expect(stored.rows[0].override_by).toBe(owner);
    expect(stored.rows[0].override_reason).toBeTruthy();
    expect(stored.rows[0].override_at).not.toBeNull();

    const claims = await claimsForGate();
    expect(canPublish(claims, "owner", true).canPublish).toBe(true);
  });
});
