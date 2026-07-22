import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import {
  articlesGeneratedCount,
  articlesPublishedCount,
  contentVelocityByWeek,
  estimatedAiCostUsd,
} from "@/lib/analytics/compute";

/**
 * Proves the Phase 11 analytics aggregation functions produce correct
 * numbers against REAL persisted rows (pglite), and that reading those
 * rows is RLS-isolated between brands — the same "real schema, real RLS"
 * bar every prior phase's integration suite holds itself to. The
 * aggregation math itself (compute.ts) is exhaustively unit-tested
 * against fixtures in tests/unit/analytics-compute.test.ts; this test
 * closes the loop by running that same code against rows that actually
 * went through Postgres.
 */
describe("analytics (pglite)", () => {
  let db: PGlite;
  const userA = "20202020-1111-1111-1111-111111111111";
  const userB = "20202020-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@analytics.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@analytics.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Analytics', 'brand-a-analytics', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Analytics', 'brand-b-analytics', $1) RETURNING id;`,
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

    await db.query(
      `INSERT INTO articles (brand_id, title, slug, status, published_at)
       VALUES
        ($1, 'Article 1', 'article-1', 'published', '2026-01-05T00:00:00Z'),
        ($1, 'Article 2', 'article-2', 'draft', NULL),
        ($1, 'Article 3', 'article-3', 'published', '2026-01-06T00:00:00Z');`,
      [brandAId],
    );

    await db.query(
      `INSERT INTO content_briefs (brand_id, title) VALUES ($1, 'Brief for brand A');`,
      [brandAId],
    );
    const brief = await db.query<{ id: string }>(
      `SELECT id FROM content_briefs WHERE brand_id = $1 LIMIT 1;`,
      [brandAId],
    );
    await db.query(
      `INSERT INTO content_pipeline_runs (brand_id, brief_id, status, total_cost_cents, total_tokens)
       VALUES ($1, $2, 'completed', 150, 1200), ($1, $2, 'completed', 250, 2000);`,
      [brandAId, brief.rows[0].id],
    );

    // Brand B's own data, to prove RLS isolation.
    await db.query(
      `INSERT INTO articles (brand_id, title, slug, status, published_at)
       VALUES ($1, 'B Article', 'b-article', 'published', '2026-02-01T00:00:00Z');`,
      [brandBId],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it("computes exact articles-generated / articles-published counts from real rows", async () => {
    const rows = await db.query<{
      id: string;
      status: "draft" | "review" | "approved" | "published";
      created_at: string;
      published_at: string | null;
    }>(`SELECT id, status, created_at, published_at FROM articles WHERE brand_id = $1;`, [brandAId]);

    const articles = rows.rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: new Date(r.created_at),
      publishedAt: r.published_at ? new Date(r.published_at) : null,
      seoScore: null,
      eeatScore: null,
      aiReadinessScore: null,
    }));

    expect(articlesGeneratedCount(articles)).toBe(3);
    expect(articlesPublishedCount(articles)).toBe(2);

    const velocity = contentVelocityByWeek(articles);
    expect(velocity.reduce((sum, v) => sum + v.count, 0)).toBe(2);
  });

  it("computes exact estimated AI cost from real pipeline run rows", async () => {
    const rows = await db.query<{
      id: string;
      status: "pending" | "running" | "completed" | "failed" | "retrying";
      total_cost_cents: number;
      total_tokens: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, status, total_cost_cents, total_tokens, created_at, updated_at FROM content_pipeline_runs WHERE brand_id = $1;`,
      [brandAId],
    );

    const runs = rows.rows.map((r) => ({
      id: r.id,
      status: r.status,
      totalCostCents: r.total_cost_cents,
      totalTokens: r.total_tokens,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    }));

    expect(estimatedAiCostUsd(runs)).toBe(4.0); // (150 + 250) cents = $4.00
  });

  it("isolates articles between brands (RLS)", async () => {
    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM articles;`);
    expect(result.rows).toHaveLength(3); // only brand A's 3 articles, never brand B's
  });
});
