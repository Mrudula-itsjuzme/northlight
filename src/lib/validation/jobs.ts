import { z } from "zod";

/**
 * Payload schemas for each `jobs.type` value (src/db/schema/enums.ts
 * jobTypeEnum), validated by the worker before dispatch — see
 * src/lib/jobs/types.ts and src/lib/jobs/worker.ts.
 */
export const embedBrandDocumentPayloadSchema = z.object({
  brandDocumentId: z.string().uuid(),
});

export const generateContentBriefPayloadSchema = z.object({
  brandId: z.string().uuid(),
  keywordId: z.string().uuid(),
});

export const runContentPipelinePayloadSchema = z.object({
  runId: z.string().uuid(),
});

export const generateGapReportPayloadSchema = z.object({
  brandId: z.string().uuid(),
  competitorId: z.string().uuid(),
});

export const runAiVisibilitySnapshotPayloadSchema = z.object({
  brandId: z.string().uuid(),
  promptId: z.string().uuid(),
});

export const computeRecommendationsPayloadSchema = z.object({
  brandId: z.string().uuid(),
});

export const recomputeKeywordScoresPayloadSchema = z.object({
  brandId: z.string().uuid(),
});
