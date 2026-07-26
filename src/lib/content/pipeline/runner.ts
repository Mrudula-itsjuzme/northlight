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
import { buildExecutionGraph, PIPELINE_DAG_NODES } from "@/lib/content/pipeline/dag";
import { searchBrandDocuments } from "@/lib/brand-brain/search";
import { getActiveCampaignContext, formatCampaignMemoryPrompt } from "@/lib/campaigns/memory";
import { getBrandGraphContext } from "@/lib/knowledge-graph/extractor";
import {
  getCachedLlmOutput,
  setCachedLlmOutput,
  getBrandBrainRevision,
  getCampaignMemoryRevision,
  getKnowledgeGraphRevision,
  getActivePromptRevision,
  getPipelineConfigRevision,
} from "@/lib/ai/cache";
import { resolveModelRouting } from "@/lib/ai/cost-optimizer";
import { evaluateAndPersistContent } from "@/lib/evaluations/engine";
import { logOperationalEvent, classifyError } from "@/lib/diagnostics/logging";

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
    .where(and(eq(contentBriefs.id, run.briefId), eq(contentBriefs.brandId, run.brandId)))
    .limit(1);
  if (!brief) throw new Error(`content_briefs row ${run.briefId} for brand ${run.brandId} not found`);

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
  } catch (err) {
    logOperationalEvent({
      category: classifyError(err),
      severity: "warn",
      subsystem: "pipeline_brand_brain",
      brandId: run.brandId,
      message: "Brand Brain vector search degraded or empty; proceeding without vector chunks",
      errorName: err instanceof Error ? err.name : undefined,
    });
    retrievedChunks = [];
  }

  // 2. Retrieve Campaign Memory Context & Knowledge Graph Context
  const campaignContext = await getActiveCampaignContext(run.brandId);
  const campaignPrompt = formatCampaignMemoryPrompt(campaignContext);
  const graphContext = await getBrandGraphContext(run.brandId);

  if (campaignPrompt || graphContext) {
    const rawCombined = `${briefContext.targetAudience || ""}\n${campaignPrompt}\n${graphContext}`.trim();
    briefContext.targetAudience = rawCombined.slice(0, 1000);
  }

  // 3. Retrieve DB-backed revisions
  const brandBrainRevision = await getBrandBrainRevision(run.brandId);
  const campaignMemoryRevision = await getCampaignMemoryRevision(run.brandId);
  const knowledgeGraphRevision = await getKnowledgeGraphRevision(run.brandId);

  // Pre-fill existing completed stage outputs if resuming
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageOutputs: Record<string, any> = {};
  const existingSteps = await db
    .select()
    .from(contentPipelineSteps)
    .where(and(eq(contentPipelineSteps.runId, runId), eq(contentPipelineSteps.status, "completed")))
    .orderBy(asc(contentPipelineSteps.attempt));

  for (const s of existingSteps) {
    stageOutputs[s.stage] = s.output;
  }

  let totalCostCents = run.totalCostCents;
  let totalTokens = run.totalTokens;

  try {
    const executionLevels = buildExecutionGraph();

    for (const level of executionLevels) {
      const pendingStages = level.filter((stage) => !stageOutputs[stage]);
      if (pendingStages.length === 0) continue;

      await db
        .update(contentPipelineRuns)
        .set({ status: "running", currentStage: pendingStages[0], updatedAt: new Date() })
        .where(eq(contentPipelineRuns.id, runId));

      const results = await Promise.all(
        pendingStages.map((stage) =>
          executeStageWithCaching({
            stage,
            brandId: run.brandId,
            runId,
            briefContext,
            stageOutputs,
            retrievedChunks,
            brandBrainRevision,
            campaignMemoryRevision,
            knowledgeGraphRevision,
          }),
        ),
      );

      for (let i = 0; i < pendingStages.length; i++) {
        const stage = pendingStages[i];
        const res = results[i];

        if (!res.ok) {
          logOperationalEvent({
            category: "retryable",
            severity: "error",
            subsystem: "pipeline_runner",
            brandId: run.brandId,
            stage,
            message: `Pipeline stage "${stage}" failed after retries; aborting pipeline run ${runId}`,
          });

          await db
            .update(contentPipelineRuns)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(contentPipelineRuns.id, runId));

          return { status: "failed" };
        }

        stageOutputs[stage] = res.output;
        totalCostCents += res.costCents;
        totalTokens += res.tokensUsed;
      }

      await db
        .update(contentPipelineRuns)
        .set({ totalCostCents, totalTokens, updatedAt: new Date() })
        .where(eq(contentPipelineRuns.id, runId));
    }

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
    logOperationalEvent({
      category: classifyError(err),
      severity: "error",
      subsystem: "pipeline_runner",
      brandId: run.brandId,
      message: `Fatal error in pipeline run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
    });

    await db
      .update(contentPipelineRuns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(contentPipelineRuns.id, runId));
    throw err;
  }
}

type ExecuteStageParams = {
  stage: PipelineStage;
  brandId: string;
  runId: string;
  briefContext: BriefContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageOutputs: Record<string, any>;
  retrievedChunks: BrandBrainChunkContext[];
  brandBrainRevision: string;
  campaignMemoryRevision: string;
  knowledgeGraphRevision: string;
};

async function executeStageWithCaching(
  params: ExecuteStageParams,
): Promise<{ ok: boolean; output?: unknown; costCents: number; tokensUsed: number }> {
  const {
    stage,
    brandId,
    runId,
    briefContext,
    stageOutputs,
    retrievedChunks,
    brandBrainRevision,
    campaignMemoryRevision,
    knowledgeGraphRevision,
  } = params;

  const db = getDb();
  const stageConfig = PIPELINE_DAG_NODES[stage];
  const promptVersion = await getActivePromptRevision(stage, brandId);
  const configRevision = getPipelineConfigRevision(stage);
  const executionMode = process.env.AI_EXECUTION_MODE || "demo";

  // Dynamic cost routing decision with multi-factor estimation
  const estimatedTokens = 1500;
  const taskComplexity = stage === "writer" || stage === "fact_check" ? "critical" : "standard";
  const routing = resolveModelRouting(stage, {
    estimatedTokens,
    taskComplexity,
  });

  const cacheLookup = {
    brandId,
    stage,
    promptVersion,
    brandBrainRevision,
    campaignMemoryRevision,
    knowledgeGraphRevision,
    executionMode,
    model: routing.model,
    provider: routing.provider,
    requestPayload: { stage, briefTitle: briefContext.primaryKeyword },
    retrievedChunkIds: retrievedChunks.map((c) => c.chunkId),
    retrievedChunkVersions: retrievedChunks.map((c) => `${c.chunkId}:v1`),
    upstreamOutputs: stageOutputs,
    configVersions: { [stage]: configRevision },
  };

  // Check Semantic Cache first
  const cached = await getCachedLlmOutput(cacheLookup);
  if (cached.hit && cached.data) {
    await db.insert(contentPipelineSteps).values({
      brandId,
      runId,
      stage,
      status: "completed",
      input: { cached: true, routingReason: routing.routingReason, promptVersion },
      output: cached.data,
      costCents: 0,
      tokensUsed: 0,
      attempt: 1,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    return { ok: true, output: cached.data, costCents: 0, tokensUsed: 0 };
  }

  // Execute Stage with Exponential Backoff Retries
  const maxAttempts = stageConfig.maxRetries || 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = new Date();
    try {
      if (attempt > 1) {
        const backoff = stageConfig.backoffMs * Math.pow(2, attempt - 2);
        await new Promise((res) => setTimeout(res, Math.min(backoff, 2000)));
      }

      const result = await runStage(stage, briefContext, stageOutputs, retrievedChunks);

      await db.insert(contentPipelineSteps).values({
        brandId,
        runId,
        stage,
        status: "completed",
        attempt,
        input: { routingReason: routing.routingReason, promptVersion },
        output: result.output,
        costCents: result.costCents,
        tokensUsed: result.tokensUsed,
        startedAt,
        completedAt: new Date(),
      });

      if (result.output && typeof result.output === "object") {
        await setCachedLlmOutput(cacheLookup, result.output as Record<string, unknown>, result.tokensUsed, result.costCents);
      }

      return { ok: true, output: result.output, costCents: result.costCents, tokensUsed: result.tokensUsed };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logOperationalEvent({
        category: "retryable",
        severity: attempt === maxAttempts ? "error" : "warn",
        subsystem: "pipeline_stage",
        brandId,
        stage,
        message: `Stage "${stage}" attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`,
      });

      await db.insert(contentPipelineSteps).values({
        brandId,
        runId,
        stage,
        status: "failed",
        attempt,
        input: { routingReason: routing.routingReason, promptVersion },
        errorMessage: lastError.message,
        startedAt,
        completedAt: new Date(),
      });
    }
  }

  return { ok: false, costCents: 0, tokensUsed: 0 };
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
    const [brief] = await tx
      .select({ id: contentBriefs.id })
      .from(contentBriefs)
      .where(and(eq(contentBriefs.id, briefId), eq(contentBriefs.brandId, brandId)))
      .limit(1);

    if (!brief) {
      throw new Error(`Content brief ${briefId} does not belong to brand ${brandId}`);
    }

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
