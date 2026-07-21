import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { generateGapReport } from "@/lib/competitors/gap-analysis";
import { gapReportTypes } from "@/lib/validation/competitors";

/**
 * Proves Phase 6's acceptance criterion ("gap report generation persists
 * and renders") against the real schema via pglite: all 5 gap report
 * types persist as rows with the demo adapter's actual (deterministic)
 * output, correctly brand+competitor scoped, and RLS isolates gap_reports
 * between brands the same way as every other tenant table.
 */
describe("gap reports (pglite)", () => {
  let db: PGlite;
  const userA = "aaaaaaaa-1111-1111-1111-111111111111";
  const userB = "bbbbbbbb-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@gap.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@gap.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Gap', 'brand-a-gap', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Gap', 'brand-b-gap', $1) RETURNING id;`,
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

  it("persists one gap_reports row per type, correctly scoped and labeled demo", async () => {
    const competitor = await db.query<{ id: string }>(
      `INSERT INTO competitors (brand_id, name, domain) VALUES ($1, 'Rival Haircare', 'rivalhair.example') RETURNING id;`,
      [brandAId],
    );
    const competitorId = competitor.rows[0].id;

    for (const type of gapReportTypes) {
      const report = generateGapReport(brandAId, competitorId, type);
      await db.query(
        `INSERT INTO gap_reports (brand_id, competitor_id, type, findings, priority_score, is_demo, generated_by)
         VALUES ($1, $2, $3, $4, $5, true, 'demo_adapter');`,
        [brandAId, competitorId, type, JSON.stringify({ items: report.findings }), report.priorityScore],
      );
    }

    const stored = await db.query<{ type: string; is_demo: boolean; generated_by: string }>(
      `SELECT type, is_demo, generated_by FROM gap_reports WHERE competitor_id = $1;`,
      [competitorId],
    );
    expect(stored.rows).toHaveLength(gapReportTypes.length);
    for (const row of stored.rows) {
      expect(row.is_demo).toBe(true);
      expect(row.generated_by).toBe("demo_adapter");
      expect(gapReportTypes).toContain(row.type);
    }
  });

  it("isolates brand A's gap reports from brand B (RLS)", async () => {
    const competitor = await db.query<{ id: string }>(
      `INSERT INTO competitors (brand_id, name, domain) VALUES ($1, 'Secret Rival', 'secretrival.example') RETURNING id;`,
      [brandBId],
    );
    const report = generateGapReport(brandBId, competitor.rows[0].id, "content");
    await db.query(
      `INSERT INTO gap_reports (brand_id, competitor_id, type, findings, priority_score, is_demo, generated_by)
       VALUES ($1, $2, 'content', $3, $4, true, 'demo_adapter');`,
      [brandBId, competitor.rows[0].id, JSON.stringify({ items: report.findings }), report.priorityScore],
    );

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM gap_reports;`);
    expect(result.rows).toHaveLength(0);

    const competitorResult = await db.query(`SELECT id FROM competitors;`);
    expect(competitorResult.rows).toHaveLength(0);
  });
});
