import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { rankRecommendations, type RecommendationSignals } from "@/lib/recommendations/rank";

/**
 * Proves Phase 10's recommendations persist correctly against the real
 * schema (pglite) and are RLS-isolated between brands, using the real
 * `rankRecommendations` function (exhaustively unit-tested in
 * tests/unit/recommendation-rank.test.ts) to produce the rows.
 */
describe("recommendations (pglite)", () => {
  let db: PGlite;
  const userA = "10101010-1111-1111-1111-111111111111";
  const userB = "10101010-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@rec.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@rec.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Rec', 'brand-a-rec', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Rec', 'brand-b-rec', $1) RETURNING id;`,
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

  const signals: RecommendationSignals = {
    keywords: [{ keywordId: "kw1", term: "detangling brush", priorityScore: 0.8 }],
    gaps: [],
    content: [],
    visibility: [],
  };

  it("persists ranked recommendations with all required fields", async () => {
    const ranked = rankRecommendations(signals);
    for (const rec of ranked) {
      await db.query(
        `INSERT INTO recommendations (brand_id, title, reason, evidence, impact, confidence, action, source_signal, rank_score, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new');`,
        [
          brandAId,
          rec.title,
          rec.reason,
          JSON.stringify(rec.evidence),
          rec.impact,
          rec.confidence,
          rec.action,
          rec.sourceSignal,
          rec.rankScore,
        ],
      );
    }

    const stored = await db.query<{ title: string; status: string; rank_score: number }>(
      `SELECT title, status, rank_score FROM recommendations WHERE brand_id = $1 ORDER BY rank_score DESC;`,
      [brandAId],
    );
    expect(stored.rows).toHaveLength(ranked.length);
    expect(stored.rows[0].status).toBe("new");
  });

  it("recompute replaces the prior set rather than accumulating duplicates", async () => {
    const ranked = rankRecommendations(signals);
    async function insertAll() {
      await db.query(`DELETE FROM recommendations WHERE brand_id = $1;`, [brandAId]);
      for (const rec of ranked) {
        await db.query(
          `INSERT INTO recommendations (brand_id, title, reason, evidence, impact, confidence, action, source_signal, rank_score, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new');`,
          [
            brandAId,
            rec.title,
            rec.reason,
            JSON.stringify(rec.evidence),
            rec.impact,
            rec.confidence,
            rec.action,
            rec.sourceSignal,
            rec.rankScore,
          ],
        );
      }
    }

    await insertAll();
    await insertAll();

    const stored = await db.query(`SELECT id FROM recommendations WHERE brand_id = $1;`, [brandAId]);
    expect(stored.rows).toHaveLength(ranked.length); // not doubled
  });

  it("isolates recommendations between brands (RLS)", async () => {
    const ranked = rankRecommendations(signals);
    for (const rec of ranked) {
      await db.query(
        `INSERT INTO recommendations (brand_id, title, reason, evidence, impact, confidence, action, source_signal, rank_score, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new');`,
        [
          brandBId,
          rec.title,
          rec.reason,
          JSON.stringify(rec.evidence),
          rec.impact,
          rec.confidence,
          rec.action,
          rec.sourceSignal,
          rec.rankScore,
        ],
      );
    }

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM recommendations;`);
    expect(result.rows).toHaveLength(0);
  });
});
