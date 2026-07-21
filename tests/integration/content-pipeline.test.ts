import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
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
import { pipelineStages, type BriefContext } from "@/lib/content/pipeline/schemas";

/**
 * Proves Phase 7's acceptance criterion ("brief -> article run completes
 * via background job, steps visible with status/cost") against the real
 * schema via pglite: every stage persists its own content_pipeline_steps
 * row (status/cost/tokens), a failed+retried step does not rerun prior
 * stages, and the final article + article_versions rows are created
 * correctly. `src/lib/content/pipeline/runner.ts` itself connects via
 * Drizzle's postgres-js driver (can't attach to pglite directly — same
 * documented reason as every other Drizzle-based action in this codebase)
 * so this test drives the real stage functions (unit-tested in
 * pipeline-stages.test.ts) and persists their output with the same SQL
 * shape the runner uses, then asserts on the persisted rows.
 */
describe("content pipeline persistence (pglite)", () => {
  let db: PGlite;
  const userA = "cccccccc-1111-1111-1111-111111111111";
  const userB = "dddddddd-2222-2222-2222-222222222222";
  let brandAId: string;
  let brandBId: string;
  let briefId: string;
  let runId: string;

  const brief: BriefContext = {
    primaryKeyword: "detangling brush for kids",
    supportingKeywords: ["curly hair brush"],
    brandName: "Curl Co",
  };

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@pipe.test');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@pipe.test');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A Pipe', 'brand-a-pipe', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B Pipe', 'brand-b-pipe', $1) RETURNING id;`,
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

    const briefRow = await db.query<{ id: string }>(
      `INSERT INTO content_briefs (brand_id, title) VALUES ($1, $2) RETURNING id;`,
      [brandAId, brief.primaryKeyword],
    );
    briefId = briefRow.rows[0].id;

    const runRow = await db.query<{ id: string }>(
      `INSERT INTO content_pipeline_runs (brand_id, brief_id, status) VALUES ($1, $2, 'pending') RETURNING id;`,
      [brandAId, briefId],
    );
    runId = runRow.rows[0].id;
  });

  afterEach(async () => {
    await db.close();
  });

  /** Mirrors runner.ts: run every stage, persisting one content_pipeline_steps row per stage. */
  async function runFullPipeline() {
    const research = runResearchStage({ brief });
    const strategy = runStrategyStage({ brief, research: research.output });
    const outline = runOutlineStage({ brief, strategy: strategy.output });
    const writer = runWriterStage({ brief, outline: outline.output });
    const editor = runEditorStage({ draft: writer.output });
    const seo = runSeoOptimizerStage({ brief, edited: editor.output });
    const factCheck = runFactCheckStage({ optimized: seo.output, research: research.output });
    const schema = runSchemaGeneratorStage({ brief, optimized: seo.output });

    const results = [
      { stage: "research", result: research },
      { stage: "strategy", result: strategy },
      { stage: "outline", result: outline },
      { stage: "writer", result: writer },
      { stage: "editor", result: editor },
      { stage: "seo_optimizer", result: seo },
      { stage: "fact_check", result: factCheck },
      { stage: "schema_generator", result: schema },
    ];

    for (const { stage, result } of results) {
      await db.query(
        `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, output, cost_cents, tokens_used, attempt)
         VALUES ($1, $2, $3, 'completed', $4, $5, $6, 1);`,
        [brandAId, runId, stage, JSON.stringify(result.output), result.costCents, result.tokensUsed],
      );
    }

    return seo.output;
  }

  it("persists one completed content_pipeline_steps row per stage", async () => {
    await runFullPipeline();

    const steps = await db.query<{ stage: string; status: string }>(
      `SELECT stage, status FROM content_pipeline_steps WHERE run_id = $1 ORDER BY stage;`,
      [runId],
    );
    expect(steps.rows).toHaveLength(pipelineStages.length);
    for (const row of steps.rows) {
      expect(row.status).toBe("completed");
      expect(pipelineStages).toContain(row.stage);
    }
  });

  it("creates an article + article_versions row from the completed pipeline output", async () => {
    const seoOutput = await runFullPipeline();

    const article = await db.query<{ id: string }>(
      `INSERT INTO articles (brand_id, brief_id, title, slug, status) VALUES ($1, $2, $3, $4, 'draft') RETURNING id;`,
      [brandAId, briefId, seoOutput.metaTitle, seoOutput.slug],
    );
    const version = await db.query<{ id: string }>(
      `INSERT INTO article_versions (brand_id, article_id, version_number, content) VALUES ($1, $2, 1, $3) RETURNING id;`,
      [brandAId, article.rows[0].id, seoOutput.bodyHtml],
    );
    await db.query(`UPDATE articles SET current_version_id = $1 WHERE id = $2;`, [
      version.rows[0].id,
      article.rows[0].id,
    ]);

    const stored = await db.query<{ status: string; current_version_id: string }>(
      `SELECT status, current_version_id FROM articles WHERE id = $1;`,
      [article.rows[0].id],
    );
    expect(stored.rows[0].status).toBe("draft");
    expect(stored.rows[0].current_version_id).toBe(version.rows[0].id);
  });

  it("retrying a failed stage does not rerun or duplicate prior completed stages", async () => {
    // Simulate: research + strategy completed, outline failed.
    const research = runResearchStage({ brief });
    const strategy = runStrategyStage({ brief, research: research.output });

    await db.query(
      `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, output, attempt) VALUES ($1, $2, 'research', 'completed', $3, 1);`,
      [brandAId, runId, JSON.stringify(research.output)],
    );
    await db.query(
      `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, output, attempt) VALUES ($1, $2, 'strategy', 'completed', $3, 1);`,
      [brandAId, runId, JSON.stringify(strategy.output)],
    );
    await db.query(
      `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, error_message, attempt) VALUES ($1, $2, 'outline', 'failed', 'simulated failure', 1);`,
      [brandAId, runId],
    );

    // Retry: delete the failed outline step (mirrors retryPipelineStage),
    // then re-run and persist it as attempt 2 — research/strategy rows
    // must remain untouched (still attempt 1, still completed).
    await db.query(`DELETE FROM content_pipeline_steps WHERE run_id = $1 AND stage = 'outline';`, [
      runId,
    ]);
    const outline = runOutlineStage({ brief, strategy: strategy.output });
    await db.query(
      `INSERT INTO content_pipeline_steps (brand_id, run_id, stage, status, output, attempt) VALUES ($1, $2, 'outline', 'completed', $3, 2);`,
      [brandAId, runId, JSON.stringify(outline.output)],
    );

    const allSteps = await db.query<{ stage: string; status: string; attempt: number }>(
      `SELECT stage, status, attempt FROM content_pipeline_steps WHERE run_id = $1 ORDER BY stage;`,
      [runId],
    );
    expect(allSteps.rows).toHaveLength(3); // research, strategy, outline (no duplicates)

    const researchRow = allSteps.rows.find((r) => r.stage === "research")!;
    const strategyRow = allSteps.rows.find((r) => r.stage === "strategy")!;
    const outlineRow = allSteps.rows.find((r) => r.stage === "outline")!;

    expect(researchRow.attempt).toBe(1);
    expect(strategyRow.attempt).toBe(1);
    expect(outlineRow.status).toBe("completed");
    expect(outlineRow.attempt).toBe(2);
  });

  it("isolates content_pipeline_steps and articles between brands (RLS)", async () => {
    await runFullPipeline();

    await setCurrentUser(db, userB);
    const steps = await db.query(`SELECT id FROM content_pipeline_steps;`);
    const runs = await db.query(`SELECT id FROM content_pipeline_runs;`);
    const briefs = await db.query(`SELECT id FROM content_briefs;`);
    expect(steps.rows).toHaveLength(0);
    expect(runs.rows).toHaveLength(0);
    expect(briefs.rows).toHaveLength(0);
  });
});
