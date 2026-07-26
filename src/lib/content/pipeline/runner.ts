import "server-only";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentPipelineRuns,
  contentPipelineSteps,
  contentBriefs,
  articles,
  articleVersions,
  articleClaims,
  brands,
} from "@/db/schema";
import {
  type PipelineStage,
  type BriefContext,
  type BrandBrainChunkContext,
} from "@/lib/content/pipeline/schemas";
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
import { searchBrandDocuments } from "@/lib/brand-brain/search";
import { getActiveCampaignContext, formatCampaignMemoryPrompt } from "@/lib/campaigns/memory";
import { getBrandGraphContext } from "@/lib/knowledge-graph/extractor";
import { getCachedLlmOutput, setCachedLlmOutput } from "@/lib/ai/cache";
import { resolveModelRouting } from "@/lib/ai/cost-optimizer";
import { computeEvaluation, evaluateAndPersistContent } from "@/lib/evaluations/engine";

export async function runPipeline(
  runId: string,
): Promise<{ status: "completed" | "failed"; articleId?: string }> {
  const db = getDb();

  const [run] = await db
    .select()
    .from(contentPipelineRuns)
    .where(eq(contentPipelineRuns.id, runId))
    .limit(1);
  if (!run) throw new Error(`content_pipeline_runs row ${runId} not found`);

  const [brief] = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.id, run.briefId))
    .limit(1);
  if (!brief) throw new Error(`content_briefs row ${run.briefId} not found`);

  const [brand] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, run.brandId))
    .limit(1);

  const briefContext: BriefContext = {
    primaryKeyword: brief.title,
    supportingKeywords: (brief.requiredSections as string[] | null) ?? [],
    targetAudience: brief.targetAudience ?? undefined,
    searchIntent: brief.searchIntent ?? undefined,
    brandName: brand?.name ?? "Your Brand",
  };

  // 1. Retrieve Brand Brain vector chunks
  let retrievedChunks: BrandBrainChunkContext[] = [];
  try {
    const searchRes = await searchBrandDocuments(run.brandId, brief.title, 5);
    retrievedChunks = searchRes.map((r) => ({
      chunkId: r.id,
      documentTitle: r.documentTitle,
      content: r.content,
      similarity: r.similarity,
    }));
  } catch {
    retrievedChunks = [];
  }

  // 2. Retrieve Campaign Memory Context & Knowledge Graph Context
  const campaignContext = await getActiveCampaignContext(run.brandId);
  const campaignPrompt = formatCampaignMemoryPrompt(campaignContext);
  const graphContext = await getBrandGraphContext(run.brandId);

  // Combine extra context into briefContext if present
  if (campaignPrompt || graphContext) {
    briefContext.targetAudience = `${briefContext.targetAudience || ""}\n${campaignPrompt}\n${graphContext}`.trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageOutputs: Record<string, any> = {};
  let totalCostCents = run.totalCostCents;
  let totalTokens = run.totalTokens;

  try {
    // Stage 1-4: Sequential writing core (Research -> Strategy -> Outline -> Writer)
    const sequentialStages: PipelineStage[] = ["research", "strategy", "outline", "writer"];

    for (const stage of sequentialStages) {
      const stepResult = await executeStageWithCaching(
        stage,
        run.brandId,
        runId,
        briefContext,
        stageOutputs,
        retrievedChunks,
      );
      if (!stepResult.ok) return { status: "failed" };

      stageOutputs[stage] = stepResult.output;
      totalCostCents += stepResult.costCents;
      totalTokens += stepResult.tokensUsed;

      await db
        .update(contentPipelineRuns)
        .set({ totalCostCents, totalTokens, currentStage: stage, updatedAt: new Date() })
        .where(eq(contentPipelineRuns.id, runId));
    }

    // Stage 5-8: Parallel DAG execution for post-writing stages (Editor, SEO, Fact Check, Schema)
    await db
      .update(contentPipelineRuns)
      .set({ status: "running", currentStage: "editor", updatedAt: new Date() })
      .where(eq(contentPipelineRuns.id, runId));

    // Editor & SEO Optimizer execute sequentially for draft polishing
    const editorRes = await executeStageWithCaching("editor", run.brandId, runId, briefContext, stageOutputs, retrievedChunks);
    if (!editorRes.ok) return { status: "failed" };
    stageOutputs.editor = editorRes.output;
    totalCostCents += editorRes.costCents;
    totalTokens += editorRes.tokensUsed;

    const seoRes = await executeStageWithCaching("seo_optimizer", run.brandId, runId, briefContext, stageOutputs, retrievedChunks);
    if (!seoRes.ok) return { status: "failed" };
    stageOutputs.seo_optimizer = seoRes.output;
    totalCostCents += seoRes.costCents;
    totalTokens += seoRes.tokensUsed;

    // Fact Check & Schema Generator execute concurrently (parallel DAG speedup)
    const [factCheckRes, schemaRes] = await Promise.all([
      executeStageWithCaching("fact_check", run.brandId, runId, briefContext, stageOutputs, retrievedChunks),
      executeStageWithCaching("schema_generator", run.brandId, runId, briefContext, stageOutputs, retrievedChunks),
    ]);

    if (!factCheckRes.ok || !schemaRes.ok) return { status: "failed" };

    stageOutputs.fact_check = factCheckRes.output;
    stageOutputs.schema_generator = schemaRes.output;
    totalCostCents += factCheckRes.costCents + schemaRes.costCents;
    totalTokens += factCheckRes.tokensUsed + schemaRes.tokensUsed;

    await db
      .update(contentPipelineRuns)
      .set({ totalCostCents, totalTokens, updatedAt: new Date() })
      .where(eq(contentPipelineRuns.id, runId));

    // Persist Article and run AI Evaluation Engine
    const articleId = await persistArticle(run.brandId, run.briefId, stageOutputs);

    const seo = stageOutputs.seo_optimizer;
    if (seo?.bodyHtml) {
      await evaluateAndPersistContent({
        brandId: run.brandId,
        articleId,
        runId,
        bodyHtml: seo.bodyHtml,
        primaryKeyword: brief.title,
        brandContextSnippets: retrievedChunks.map((c) => c.content),
        claims: stageOutputs.fact_check?.claims,
      });
    }

    await db
      .update(contentPipelineRuns)
      .set({ status: "completed", articleId, currentStage: null, updatedAt: new Date() })
      .where(eq(contentPipelineRuns.id, runId));

    return { status: "completed", articleId };
  } catch (err) {
    await db
      .update(contentPipelineRuns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(contentPipelineRuns.id, runId));
    throw err;
  }
}

async function executeStageWithCaching(
  stage: PipelineStage,
  brandId: string,
  runId: string,
  briefContext: BriefContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageOutputs: Record<string, any>,
  retrievedChunks: BrandBrainChunkContext[],
): Promise<{ ok: boolean; output?: any; costCents: number; tokensUsed: number }> {
  const db = getDb();
  const routing = resolveModelRouting(stage);
  const executionMode = process.env.AI_EXECUTION_MODE || "demo";

  // Check Semantic Cache first
  const cacheLookup = {
    brandId,
    stage,
    promptVersion: "v1.0.0",
    executionMode,
    model: routing.model,
    provider: routing.provider,
    requestPayload: { stage, briefTitle: briefContext.primaryKeyword },
  };

  const cached = await getCachedLlmOutput(cacheLookup);
  if (cached.hit && cached.data) {
    await db.insert(contentPipelineSteps).values({
      brandId,
      runId,
      stage,
      status: "completed",
      input: { cached: true, routingReason: routing.routingReason },
      output: cached.data,
      costCents: 0,
      tokensUsed: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    return { ok: true, output: cached.data, costCents: 0, tokensUsed: 0 };
  }

  // Execute Stage
  const startedAt = new Date();
  try {
    const result = await runStage(stage, briefContext, stageOutputs, retrievedChunks);

    await db.insert(contentPipelineSteps).values({
      brandId,
      runId,
      stage,
      status: "completed",
      input: { routingReason: routing.routingReason },
      output: result.output,
      costCents: result.costCents,
      tokensUsed: result.tokensUsed,
      startedAt,
      completedAt: new Date(),
    });

    // Populate Semantic Cache
    if (result.output && typeof result.output === "object") {
      await setCachedLlmOutput(cacheLookup, result.output as Record<string, unknown>, result.tokensUsed, result.costCents);
    }

    return { ok: true, output: result.output, costCents: result.costCents, tokensUsed: result.tokensUsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stage execution failed";
    await db.insert(contentPipelineSteps).values({
      brandId,
      runId,
      stage,
      status: "failed",
      input: { routingReason: routing.routingReason },
      errorMessage: message,
      startedAt,
      completedAt: new Date(),
    });
    return { ok: false, costCents: 0, tokensUsed: 0 };
  }
}

async function runStage(
  stage: PipelineStage,
  brief: BriefContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputs: Record<string, any>,
  retrievedChunks: BrandBrainChunkContext[],
) {
  switch (stage) {
    case "research":
      return runResearchStage({ brief, retrievedChunks });
    case "strategy":
      return runStrategyStage({ brief, research: outputs.research, retrievedChunks });
    case "outline":
      return runOutlineStage({ brief, strategy: outputs.strategy });
    case "writer":
      return runWriterStage({ brief, outline: outputs.outline });
    case "editor":
      return runEditorStage({ draft: outputs.writer });
    case "seo_optimizer":
      return runSeoOptimizerStage({ brief, edited: outputs.editor });
    case "fact_check":
      return runFactCheckStage({ optimized: outputs.seo_optimizer, research: outputs.research });
    case "schema_generator":
      return runSchemaGeneratorStage({ brief, optimized: outputs.seo_optimizer });
    default: {
      const exhaustiveCheck: never = stage;
      throw new Error(`Unknown pipeline stage: ${exhaustiveCheck}`);
    }
  }
}

async function persistArticle(
  brandId: string,
  briefId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputs: Record<string, any>,
): Promise<string> {
  const db = getDb();
  const seo = outputs.seo_optimizer;
  const factCheck = outputs.fact_check;

  return db.transaction(async (tx) => {
    const [article] = await tx
      .insert(articles)
      .values({
        brandId,
        briefId,
        title: seo.metaTitle,
        slug: seo.slug,
        status: "draft",
      })
      .returning({ id: articles.id });

    const [version] = await tx
      .insert(articleVersions)
      .values({
        brandId,
        articleId: article.id,
        versionNumber: 1,
        content: seo.bodyHtml,
      })
      .returning({ id: articleVersions.id });

    await tx
      .update(articles)
      .set({ currentVersionId: version.id })
      .where(eq(articles.id, article.id));

    if (factCheck?.claims && Array.isArray(factCheck.claims)) {
      for (const claim of factCheck.claims) {
        await tx.insert(articleClaims).values({
          brandId,
          articleId: article.id,
          claimText: claim.claimText,
          status: "unresolved",
          verificationStatus: claim.verificationStatus ?? (claim.supported ? "verified" : "requires_review"),
          sourceReference: claim.sourceReference ?? null,
          confidence: claim.confidence ?? 0.8,
        });
      }
    }

    return article.id;
  });
}

export async function retryPipelineStage(runId: string, stage: PipelineStage): Promise<void> {
  const db = getDb();
  await db
    .delete(contentPipelineSteps)
    .where(and(eq(contentPipelineSteps.runId, runId), eq(contentPipelineSteps.stage, stage)));
  await runPipeline(runId);
}
