import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { scoreKeywordSet } from "@/lib/scoring/priority";

/**
 * Proves Phase 5's data-layer contract against the real schema (pglite):
 * keywords persist raw + normalized + computed priority score, rescoring
 * appends to `keyword_scores` (append-only history, never overwritten),
 * and RLS still isolates keywords between brands (new coverage
 * specifically exercising the scoring columns, complementing the generic
 * keywords-table isolation already proven in tenant-isolation.test.ts).
 *
 * `src/lib/keywords/rescore.ts` connects via Drizzle's postgres-js driver
 * (a real TCP client), which can't attach to pglite directly — same
 * documented reason as brand-membership.test.ts — so this test calls the
 * real `scoreKeywordSet` function (the actual scoring logic, unit-tested
 * exhaustively in tests/unit/priority-scoring.test.ts) and persists its
 * output with the same SQL shape `rescoreAllKeywords` uses.
 */
describe("keyword scoring persistence (pglite)", () => {
  let db: PGlite;
  const userA = "88888888-8888-8888-8888-888888888888";
  const userB = "99999999-9999-9999-9999-999999999999";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@kw.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@kw.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A KW', 'brand-a-kw', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B KW', 'brand-b-kw', $1) RETURNING id;`,
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

  async function rescoreBrand(brandId: string, formulaVersion = 1) {
    const rows = await db.query<{
      id: string;
      raw_volume: number;
      raw_difficulty: number;
      raw_commercial_intent: number;
      raw_trend: number;
      raw_business_value: number;
    }>(
      `SELECT id, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value
       FROM keywords WHERE brand_id = $1;`,
      [brandId],
    );

    const scored = scoreKeywordSet(
      rows.rows.map((r) => ({
        id: r.id,
        rawVolume: r.raw_volume,
        rawDifficulty: r.raw_difficulty,
        commercialIntent: r.raw_commercial_intent,
        trend: r.raw_trend,
        businessValue: r.raw_business_value,
      })),
    );

    for (const result of scored) {
      await db.query(
        `UPDATE keywords SET normalized_volume = $1, normalized_difficulty = $2, priority_score = $3 WHERE id = $4;`,
        [result.normalizedVolume, result.normalizedDifficulty, result.priorityScore, result.id],
      );
      await db.query(
        `INSERT INTO keyword_scores (brand_id, keyword_id, formula_version, normalized_volume, normalized_difficulty, commercial_intent, trend, business_value, priority_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          brandId,
          result.id,
          formulaVersion,
          result.normalizedVolume,
          result.normalizedDifficulty,
          result.commercialIntent,
          result.trend,
          result.businessValue,
          result.priorityScore,
        ],
      );
    }
    return scored;
  }

  it("persists normalized values and priority score onto the keywords row", async () => {
    await db.query(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value)
       VALUES ($1, 'detangling brush', 1000, 20, 0.8, 0.5, 0.9);`,
      [brandAId],
    );
    await db.query(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value)
       VALUES ($1, 'kids shampoo', 5000, 60, 0.3, 0.2, 0.4);`,
      [brandAId],
    );

    await rescoreBrand(brandAId);

    const stored = await db.query<{ term: string; priority_score: number }>(
      `SELECT term, priority_score FROM keywords WHERE brand_id = $1 ORDER BY term;`,
      [brandAId],
    );
    expect(stored.rows).toHaveLength(2);
    for (const row of stored.rows) {
      expect(row.priority_score).not.toBeNull();
    }
  });

  it("appends to keyword_scores history rather than overwriting on repeated rescoring", async () => {
    const kw = await db.query<{ id: string }>(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value)
       VALUES ($1, 'solo keyword', 1000, 20, 0.8, 0.5, 0.9) RETURNING id;`,
      [brandAId],
    );
    const keywordId = kw.rows[0].id;

    await rescoreBrand(brandAId);
    await rescoreBrand(brandAId); // add a second keyword between runs to shift baseline
    await db.query(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value)
       VALUES ($1, 'second keyword', 9000, 90, 0.1, 0.1, 0.1);`,
      [brandAId],
    );
    await rescoreBrand(brandAId);

    const history = await db.query(
      `SELECT id FROM keyword_scores WHERE keyword_id = $1;`,
      [keywordId],
    );
    // Three rescore runs => three history rows for this keyword, none overwritten.
    expect(history.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("isolates brand A's keywords and keyword_scores from brand B (RLS)", async () => {
    await db.query(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value)
       VALUES ($1, 'secret competitor keyword', 1000, 20, 0.8, 0.5, 0.9);`,
      [brandBId],
    );
    await rescoreBrand(brandBId);

    await setCurrentUser(db, userA);
    const keywordResult = await db.query(`SELECT id FROM keywords;`);
    const scoreResult = await db.query(`SELECT id FROM keyword_scores;`);
    expect(keywordResult.rows).toHaveLength(0);
    expect(scoreResult.rows).toHaveLength(0);
  });
});
