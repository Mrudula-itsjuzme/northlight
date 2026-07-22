import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser } from "../db/pglite";
import {
  runResearchStage,
  runStrategyStage,
  runOutlineStage,
  runWriterStage,
  runEditorStage,
  runSeoOptimizerStage,
  runFactCheckStage,
  runSchemaGeneratorStage,
} from "@/lib/content/pipeline/stages";
import type { BriefContext } from "@/lib/content/pipeline/schemas";
import { scoreKeywordSet } from "@/lib/scoring/priority";
import { computeArticleScores } from "@/lib/content/scoring/article-scores";
import { canPublish } from "@/lib/content/publish-gate";

/**
 * Phase 14's required "onboarding -> article" flow test. This is a
 * DATA-LAYER integration test, not a full browser e2e — the plan
 * explicitly calls for documenting it as such given this sandbox has no
 * browser/Playwright runtime and every Drizzle-backed action in this
 * codebase already can't attach to pglite directly (postgres-js vs.
 * pglite's embedded engine — see tests/db/pglite.ts's own docstring and
 * every other integration test in this suite). What this test DOES
 * prove: chaining every real, already-unit-tested pure function
 * (scoreKeywordSet, the 8 pipeline stage functions, computeArticleScores,
 * canPublish) against the REAL schema via pglite reproduces the full
 * onboarding-through-publish-gate journey end to end, with each step's
 * output persisted and read back exactly as the real actions would:
 *
 *   1. Brand created (onboarding start)
 *   2. Store + product uploaded (onboarding "connect store" step)
 *   3. Brand document uploaded and marked ready (onboarding "brand brain" step)
 *   4. Keyword seeded and scored via the real priority formula (onboarding "keywords" step)
 *   5. Content brief generated from that keyword
 *   6. Content pipeline run through all 8 real stages, article + version persisted
 *   7. Article scored via the real computeArticleScores
 *   8. Publish attempt blocked by an unresolved claim (the real canPublish gate)
 *   9. Publish succeeds once the claim is resolved
 *
 * Each intermediate assertion checks the REAL persisted row state, not
 * just an in-memory value, so a break anywhere in this chain (e.g. a
 * migration change that silently drops a required column) would fail
 * this test.
 */
describe("onboarding -> article flow (pglite, data-layer integration test)", () => {
  let db: PGlite;
  const userId = "66666666-7777-7777-7777-777777777777";
  let brandId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'founder@flow.test');`, [userId]);

    const brand = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Flow Test Brand', 'flow-test-brand', $1) RETURNING id;`,
      [userId],
    );
    brandId = brand.rows[0].id;
    await db.query(`INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`, [
      brandId,
      userId,
    ]);
  });

  afterEach(async () => {
    await db.close();
  });

  it("chains brand creation through document upload, keyword scoring, brief, article generation, and the publish gate", async () => {
    // --- Step 1: onboarding "connect store" — store + product ---
    const store = await db.query<{ id: string }>(
      `INSERT INTO stores (brand_id, platform) VALUES ($1, 'shopify') RETURNING id;`,
      [brandId],
    );
    await db.query(`INSERT INTO products (brand_id, store_id, name) VALUES ($1, $2, 'Detangling Brush');`, [
      brandId,
      store.rows[0].id,
    ]);
    const productCheck = await db.query(`SELECT id FROM products WHERE brand_id = $1;`, [brandId]);
    expect(productCheck.rows).toHaveLength(1);

    // --- Step 2: onboarding "brand brain" — document uploaded, indexed ready ---
    const doc = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, raw_text, status)
       VALUES ($1, 'Brand Voice Guide', 'typed_text', 'Speak warmly to parents and tweens.', 'pending')
       RETURNING id;`,
      [brandId],
    );
    await db.query(`UPDATE brand_documents SET status = 'ready' WHERE id = $1;`, [doc.rows[0].id]);
    const docCheck = await db.query<{ status: string }>(`SELECT status FROM brand_documents WHERE brand_id = $1;`, [
      brandId,
    ]);
    expect(docCheck.rows[0].status).toBe("ready");

    // --- Step 3: onboarding "keywords" — seed + score via the REAL formula ---
    const keyword = await db.query<{ id: string }>(
      `INSERT INTO keywords (brand_id, term, raw_volume, raw_difficulty, raw_commercial_intent, raw_trend, raw_business_value, source)
       VALUES ($1, 'detangling brush for curly hair', 90, 45, 0.8, 0.7, 0.9, 'onboarding') RETURNING id;`,
      [brandId],
    );
    const scored = scoreKeywordSet([
      { rawVolume: 90, rawDifficulty: 45, commercialIntent: 0.8, trend: 0.7, businessValue: 0.9 },
    ]);
    await db.query(
      `UPDATE keywords SET normalized_volume = $1, normalized_difficulty = $2, priority_score = $3 WHERE id = $4;`,
      [scored[0].normalizedVolume, scored[0].normalizedDifficulty, scored[0].priorityScore, keyword.rows[0].id],
    );
    const keywordCheck = await db.query<{ priority_score: number }>(
      `SELECT priority_score FROM keywords WHERE id = $1;`,
      [keyword.rows[0].id],
    );
    expect(keywordCheck.rows[0].priority_score).toBeCloseTo(scored[0].priorityScore, 10);
    // Single-keyword set -> min===max -> normalized midpoint 0.5 for both
    // volume and difficulty, per minMaxNormalize's documented no-variance
    // fallback — asserted here as a sanity check on the real formula's
    // behavior in this exact single-keyword scenario.
    expect(scored[0].normalizedVolume).toBe(0.5);

    // --- Step 4: content brief generated from the keyword ---
    const brief = await db.query<{ id: string }>(
      `INSERT INTO content_briefs (brand_id, keyword_id, title) VALUES ($1, $2, 'detangling brush for curly hair') RETURNING id;`,
      [brandId, keyword.rows[0].id],
    );

    // --- Step 5: content pipeline run through all 8 REAL stages ---
    const run = await db.query<{ id: string }>(
      `INSERT INTO content_pipeline_runs (brand_id, brief_id, status) VALUES ($1, $2, 'pending') RETURNING id;`,
      [brandId, brief.rows[0].id],
    );

    const briefContext: BriefContext = {
      primaryKeyword: "detangling brush for curly hair",
      supportingKeywords: [],
      brandName: "Flow Test Brand",
    };
    const research = runResearchStage({ brief: briefContext });
    const strategy = runStrategyStage({ brief: briefContext, research: research.output });
    const outline = runOutlineStage({ brief: briefContext, strategy: strategy.output });
    const writer = runWriterStage({ brief: briefContext, outline: outline.output });
    const editor = runEditorStage({ draft: writer.output });
    const seo = runSeoOptimizerStage({ brief: briefContext, edited: editor.output });
    const factCheck = runFactCheckStage({ optimized: seo.output, research: research.output });
    const schema = runSchemaGeneratorStage({ brief: briefContext, optimized: seo.output });

    for (const { stage, result } of [
      { stage: "research", result: research },
      { stage: "strategy", result: strategy },
      { stage: "outline", result: outline },
      { stage: "writer", result: writer },
      { stage: "editor", result: editor },
      { stage: "seo_optimizer", result: seo },
      { stage: "fact_check", result: factCheck },
      { stage: "schema_generator", result: schema },
    ]) {
      await db.query(
        `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, output, cost_cents, tokens_used, attempt)
         VALUES ($1, $2, $3, 'completed', $4, $5, $6, 1);`,
        [brandId, run.rows[0].id, stage, JSON.stringify(result.output), result.costCents, result.tokensUsed],
      );
    }
    await db.query(`UPDATE content_pipeline_runs SET status = 'completed' WHERE id = $1;`, [run.rows[0].id]);

    const stepCount = await db.query(`SELECT id FROM content_pipeline_steps WHERE run_id = $1;`, [run.rows[0].id]);
    expect(stepCount.rows).toHaveLength(8);

    // --- Step 6: article + version persisted from the real pipeline output ---
    const article = await db.query<{ id: string }>(
      `INSERT INTO articles (brand_id, brief_id, title, slug, status) VALUES ($1, $2, $3, $4, 'draft') RETURNING id;`,
      [brandId, brief.rows[0].id, seo.output.metaTitle, seo.output.slug],
    );
    const version = await db.query<{ id: string }>(
      `INSERT INTO article_versions (brand_id, article_id, version_number, content) VALUES ($1, $2, 1, $3) RETURNING id;`,
      [brandId, article.rows[0].id, seo.output.bodyHtml],
    );
    await db.query(`UPDATE articles SET current_version_id = $1 WHERE id = $2;`, [
      version.rows[0].id,
      article.rows[0].id,
    ]);

    // --- Step 7: article scored via the real computeArticleScores ---
    const scores = computeArticleScores({
      bodyHtml: seo.output.bodyHtml,
      metaTitle: seo.output.metaTitle,
      metaDescription: seo.output.metaDescription,
      primaryKeyword: "detangling brush for curly hair",
      claimCount: 1,
      unresolvedClaimCount: 1,
      hasJsonLd: true,
    });
    await db.query(
      `UPDATE articles SET seo_score = $1, eeat_score = $2, ai_readiness_score = $3, status = 'approved' WHERE id = $4;`,
      [scores.seoScore, scores.eeatScore, scores.aiReadinessScore, article.rows[0].id],
    );

    const scoredArticle = await db.query<{ seo_score: number; status: string }>(
      `SELECT seo_score, status FROM articles WHERE id = $1;`,
      [article.rows[0].id],
    );
    expect(scoredArticle.rows[0].seo_score).toBe(scores.seoScore);
    expect(scoredArticle.rows[0].status).toBe("approved");

    // --- Step 8: an unresolved claim blocks the real publish gate ---
    await db.query(
      `INSERT INTO article_claims (brand_id, article_id, claim_text, status) VALUES ($1, $2, 'Dermatologist recommended for all hair types.', 'unresolved');`,
      [brandId, article.rows[0].id],
    );
    const claimsBeforeResolution = await db.query<{ status: string }>(
      `SELECT status FROM article_claims WHERE article_id = $1;`,
      [article.rows[0].id],
    );
    const gateBefore = canPublish(
      claimsBeforeResolution.rows.map((c) => ({ status: c.status as "unresolved" | "resolved" | "overridden" })),
      "editor",
      false,
    );
    expect(gateBefore.canPublish).toBe(false);

    // --- Step 9: resolving the claim unblocks the real publish gate, and publishing persists ---
    await db.query(
      `UPDATE article_claims SET status = 'resolved', resolved_by = $1, resolved_at = now() WHERE article_id = $2;`,
      [userId, article.rows[0].id],
    );
    const claimsAfterResolution = await db.query<{ status: string }>(
      `SELECT status FROM article_claims WHERE article_id = $1;`,
      [article.rows[0].id],
    );
    const gateAfter = canPublish(
      claimsAfterResolution.rows.map((c) => ({ status: c.status as "unresolved" | "resolved" | "overridden" })),
      "editor",
      false,
    );
    expect(gateAfter.canPublish).toBe(true);

    await db.query(`UPDATE articles SET status = 'published', published_at = now() WHERE id = $1;`, [
      article.rows[0].id,
    ]);
    await db.query(
      `INSERT INTO publications (brand_id, article_id, published_by, was_override) VALUES ($1, $2, $3, false);`,
      [brandId, article.rows[0].id, userId],
    );

    const finalArticle = await db.query<{ status: string; published_at: string | null }>(
      `SELECT status, published_at FROM articles WHERE id = $1;`,
      [article.rows[0].id],
    );
    expect(finalArticle.rows[0].status).toBe("published");
    expect(finalArticle.rows[0].published_at).not.toBeNull();

    const publicationRow = await db.query(`SELECT id FROM publications WHERE article_id = $1;`, [
      article.rows[0].id,
    ]);
    expect(publicationRow.rows).toHaveLength(1);
  });
});
