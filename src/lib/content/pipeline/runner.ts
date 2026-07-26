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
  pipelineStages,
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

  // Priority 2: Retrieve Brand Brain context for grounding
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageOutputs: Record<string, any> = {};
  let totalCostCents = run.totalCostCents;
  let totalTokens = run.totalTokens;

  try {
    for (const stage of pipelineStages) {
      await db
        .update(contentPipelineRuns)
        .set({ status: "running", currentStage: stage, updatedAt: new Date() })
        .where(eq(contentPipelineRuns.id, runId));

      const [existingStep] = await db
        .select()
        .from(contentPipelineSteps)
        .where(
          and(
            eq(contentPipelineSteps.runId, runId),
            eq(contentPipelineSteps.stage, stage),
          ),
        )
        .orderBy(asc(contentPipelineSteps.attempt));

      if (existingStep && existingStep.status === "completed") {
        stageOutputs[stage] = existingStep.output;
        continue;
      }

      const startedAt = new Date();
      let result;
      try {
        result = await runStage(stage, briefContext, stageOutputs, retrievedChunks);
      } catch (stageErr) {
        const message = stageErr instanceof Error ? stageErr.message : "Stage failed";
        await db.insert(contentPipelineSteps).values({
          brandId: run.brandId,
          runId,
          stage,
          status: "failed",
          input: buildStageInput(stage, briefContext, stageOutputs, retrievedChunks),
          errorMessage: message,
          attempt: (existingStep?.attempt ?? 0) + 1,
          startedAt,
          completedAt: new Date(),
        });
        await db
          .update(contentPipelineRuns)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(contentPipelineRuns.id, runId));
        return { status: "failed" };
      }

      await db.insert(contentPipelineSteps).values({
        brandId: run.brandId,
        runId,
        stage,
        status: "completed",
        input: buildStageInput(stage, briefContext, stageOutputs, retrievedChunks),
        output: result.output,
        attempt: (existingStep?.attempt ?? 0) + 1,
        costCents: result.costCents,
        tokensUsed: result.tokensUsed,
        startedAt,
        completedAt: new Date(),
      });

      stageOutputs[stage] = result.output;
      totalCostCents += result.costCents;
      totalTokens += result.tokensUsed;

      await db
        .update(contentPipelineRuns)
        .set({ totalCostCents, totalTokens, updatedAt: new Date() })
        .where(eq(contentPipelineRuns.id, runId));
    }

    const articleId = await persistArticle(run.brandId, run.briefId, stageOutputs);

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

function buildStageInput(
  stage: PipelineStage,
  brief: BriefContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputs: Record<string, any>,
  retrievedChunks: BrandBrainChunkContext[],
) {
  switch (stage) {
    case "research":
      return { brief, retrievedChunks };
    case "strategy":
      return { brief, research: outputs.research, retrievedChunks };
    case "outline":
      return { brief, strategy: outputs.strategy };
    case "writer":
      return { brief, outline: outputs.outline };
    case "editor":
      return { draft: outputs.writer };
    case "seo_optimizer":
      return { brief, edited: outputs.editor };
    case "fact_check":
      return { optimized: outputs.seo_optimizer, research: outputs.research };
    case "schema_generator":
      return { brief, optimized: outputs.seo_optimizer };
    default:
      return {};
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

    // Priority 3: Save extracted claims to article_claims
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
