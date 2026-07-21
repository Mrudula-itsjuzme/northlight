import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser } from "../db/pglite";

/**
 * Proves Phase 3's "reload mid-wizard doesn't lose data" acceptance
 * criterion at the data layer: onboarding progress is derived entirely
 * from which rows already exist (mirrors src/lib/onboarding/state.ts's
 * getOnboardingState logic) rather than a separate mutable "current step"
 * field that could drift from the actual data. This test exercises the
 * exact SQL shape getOnboardingState() issues (one SELECT per table,
 * existence-only) against the real schema via pglite, proving that if the
 * process restarted right after any given step, the next read would
 * correctly resume at that step.
 */
describe("onboarding state derivation (pglite)", () => {
  let db: PGlite;
  const userId = "55555555-5555-5555-5555-555555555555";
  let brandId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, $2);`, [
      userId,
      "founder@brand.test",
    ]);
    const brand = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Tween Haircare', 'tween-haircare', $1) RETURNING id;`,
      [userId],
    );
    brandId = brand.rows[0].id;
    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
      [brandId, userId],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  async function deriveStep(): Promise<string> {
    const [storeRows, productRows, docRows, keywordRows] = await Promise.all([
      db.query(`SELECT id FROM stores WHERE brand_id = $1 LIMIT 1;`, [brandId]),
      db.query(`SELECT id FROM products WHERE brand_id = $1 LIMIT 1;`, [brandId]),
      db.query<{ status: string }>(
        `SELECT status FROM brand_documents WHERE brand_id = $1;`,
        [brandId],
      ),
      db.query(`SELECT id FROM keywords WHERE brand_id = $1 LIMIT 1;`, [brandId]),
    ]);

    const hasStore = storeRows.rows.length > 0;
    const hasProducts = productRows.rows.length > 0;
    const hasDocuments = docRows.rows.length > 0;
    const brandBrainIndexed =
      hasDocuments && docRows.rows.every((d) => d.status === "ready" || d.status === "failed");
    const hasKeywords = keywordRows.rows.length > 0;

    if (hasKeywords) return "done";
    if (brandBrainIndexed) return "keywords";
    if (hasDocuments) return "brand-brain";
    if (hasProducts) return "documents";
    if (hasStore) return "products";
    return "store";
  }

  it("starts at the store step for a brand new brand", async () => {
    expect(await deriveStep()).toBe("store");
  });

  it("advances to products once a store exists", async () => {
    await db.query(
      `INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`,
      [brandId],
    );
    expect(await deriveStep()).toBe("products");
  });

  it("advances to documents once a product exists", async () => {
    await db.query(`INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`, [brandId]);
    await db.query(`INSERT INTO products (brand_id, name) VALUES ($1, 'Detangling Brush');`, [
      brandId,
    ]);
    expect(await deriveStep()).toBe("documents");
  });

  it("stays at brand-brain while a document is still pending/chunking/embedding", async () => {
    await db.query(`INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`, [brandId]);
    await db.query(`INSERT INTO products (brand_id, name) VALUES ($1, 'Detangling Brush');`, [
      brandId,
    ]);
    await db.query(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Brand Voice', 'typed_text', 'pending');`,
      [brandId],
    );
    expect(await deriveStep()).toBe("brand-brain");
  });

  it("advances to keywords once every document has finished indexing (ready or failed)", async () => {
    await db.query(`INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`, [brandId]);
    await db.query(`INSERT INTO products (brand_id, name) VALUES ($1, 'Detangling Brush');`, [
      brandId,
    ]);
    await db.query(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Brand Voice', 'typed_text', 'ready');`,
      [brandId],
    );
    expect(await deriveStep()).toBe("keywords");
  });

  it("reaches done once a keyword exists", async () => {
    await db.query(`INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`, [brandId]);
    await db.query(`INSERT INTO products (brand_id, name) VALUES ($1, 'Detangling Brush');`, [
      brandId,
    ]);
    await db.query(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Brand Voice', 'typed_text', 'ready');`,
      [brandId],
    );
    await db.query(`INSERT INTO keywords (brand_id, term) VALUES ($1, 'detangling brush');`, [
      brandId,
    ]);
    expect(await deriveStep()).toBe("done");
  });

  it("resumes at the correct step after a simulated reload (same data, fresh read)", async () => {
    await db.query(`INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify');`, [brandId]);
    await db.query(`INSERT INTO products (brand_id, name) VALUES ($1, 'Detangling Brush');`, [
      brandId,
    ]);
    // Simulate "reload": derive the step again from scratch, no client state carried over.
    const stepAfterReload = await deriveStep();
    expect(stepAfterReload).toBe("documents");
  });
});
