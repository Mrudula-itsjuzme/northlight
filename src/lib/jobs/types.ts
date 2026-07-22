import type { z } from "zod";
import {
  embedBrandDocumentPayloadSchema,
  generateContentBriefPayloadSchema,
  runContentPipelinePayloadSchema,
  generateGapReportPayloadSchema,
  runAiVisibilitySnapshotPayloadSchema,
  computeRecommendationsPayloadSchema,
  recomputeKeywordScoresPayloadSchema,
} from "@/lib/validation/jobs";

/**
 * One Zod schema per `job_type` enum value (src/db/schema/enums.ts
 * jobTypeEnum), so a job's untyped `jsonb` payload column is validated
 * before a handler ever touches it — the same "validate input at system
 * boundaries" rule every other server action in this app follows. A job
 * row with a malformed payload fails fast with a clear error recorded on
 * the row, rather than throwing a confusing error deep inside a handler.
 */
export const JOB_PAYLOAD_SCHEMAS = {
  embed_brand_document: embedBrandDocumentPayloadSchema,
  generate_content_brief: generateContentBriefPayloadSchema,
  run_content_pipeline: runContentPipelinePayloadSchema,
  generate_gap_report: generateGapReportPayloadSchema,
  run_ai_visibility_snapshot: runAiVisibilitySnapshotPayloadSchema,
  compute_recommendations: computeRecommendationsPayloadSchema,
  recompute_keyword_scores: recomputeKeywordScoresPayloadSchema,
} as const;

export type JobType = keyof typeof JOB_PAYLOAD_SCHEMAS;

export type JobPayloadFor<T extends JobType> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>;
