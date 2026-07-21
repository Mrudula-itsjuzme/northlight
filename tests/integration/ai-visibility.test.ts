import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { createDemoVisibilityAdapter } from "@/lib/ai/visibility/demo-adapter";
import { AI_PLATFORM_KEYS } from "@/lib/ai/visibility/adapter";

/**
 * Proves Phase 9's acceptance criterion ("demo adapter produces a
 * snapshot") against the real schema via pglite: a snapshot run persists
 * one ai_visibility_snapshots row per platform, correctly brand+prompt
 * scoped, all labeled is_demo, and RLS isolates both ai_prompts and
 * ai_visibility_snapshots between brands — while ai_platforms (the global
 * reference table) remains readable by any authenticated brand member,
 * same as tenant-isolation.test.ts already proves generically.
 */
describe("AI visibility snapshots (pglite)", () => {
  let db: PGlite;
  const userA = "ffffffff-1111-1111-1111-111111111111";
  const userB = "ffffffff-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@vis.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@vis.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Vis', 'brand-a-vis', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Vis', 'brand-b-vis', $1) RETURNING id;`,
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

    for (const key of AI_PLATFORM_KEYS) {
      await db.query(
        `INSERT INTO ai_platforms (key, display_name, has_live_adapter) VALUES ($1, $2, false) ON CONFLICT DO NOTHING;`,
        [key, key],
      );
    }
  });

  afterEach(async () => {
    await db.close();
  });

  it("persists one snapshot row per platform for a prompt run", async () => {
    const prompt = await db.query<{ id: string }>(
      `INSERT INTO ai_prompts (brand_id, prompt_text) VALUES ($1, 'best detangling brush') RETURNING id;`,
      [brandAId],
    );
    const promptId = prompt.rows[0].id;

    const platformRows = await db.query<{ id: string; key: string }>(`SELECT id, key FROM ai_platforms;`);
    const platformIdByKey = new Map(platformRows.rows.map((r) => [r.key, r.id]));

    for (const platform of AI_PLATFORM_KEYS) {
      const adapter = createDemoVisibilityAdapter(platform);
      const result = await adapter.check("best detangling brush", "Brand A Vis");
      await db.query(
        `INSERT INTO ai_visibility_snapshots (brand_id, prompt_id, platform_id, mentioned, position, sentiment, confidence, raw_response, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          brandAId,
          promptId,
          platformIdByKey.get(platform),
          result.mentioned,
          result.position,
          result.sentiment,
          result.confidence,
          result.rawResponse,
          result.isDemo,
        ],
      );
    }

    const stored = await db.query<{ is_demo: boolean }>(
      `SELECT is_demo FROM ai_visibility_snapshots WHERE prompt_id = $1;`,
      [promptId],
    );
    expect(stored.rows).toHaveLength(AI_PLATFORM_KEYS.length);
    for (const row of stored.rows) {
      expect(row.is_demo).toBe(true);
    }
  });

  it("isolates ai_prompts and ai_visibility_snapshots between brands (RLS)", async () => {
    const prompt = await db.query<{ id: string }>(
      `INSERT INTO ai_prompts (brand_id, prompt_text) VALUES ($1, 'secret prompt') RETURNING id;`,
      [brandBId],
    );
    const platform = await db.query<{ id: string }>(`SELECT id FROM ai_platforms LIMIT 1;`);
    await db.query(
      `INSERT INTO ai_visibility_snapshots (brand_id, prompt_id, platform_id, mentioned, sentiment, raw_response, is_demo)
       VALUES ($1, $2, $3, false, 'unknown', 'raw', true);`,
      [brandBId, prompt.rows[0].id, platform.rows[0].id],
    );

    await setCurrentUser(db, userA);
    const promptResult = await db.query(`SELECT id FROM ai_prompts;`);
    const snapshotResult = await db.query(`SELECT id FROM ai_visibility_snapshots;`);
    expect(promptResult.rows).toHaveLength(0);
    expect(snapshotResult.rows).toHaveLength(0);

    // Reference table remains visible regardless of brand.
    const platformResult = await db.query(`SELECT id FROM ai_platforms;`);
    expect(platformResult.rows.length).toBeGreaterThan(0);
  });
});
