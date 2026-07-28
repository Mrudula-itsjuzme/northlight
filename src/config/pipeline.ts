import "server-only";
import { z } from "zod";

export const pipelineStageSchema = z.enum([
  "research",
  "strategy",
  "outline",
  "writer",
  "editor",
  "self_review",
  "seo_optimizer",
  "fact_check",
  "schema_generator",
]);

export type PipelineStageId = z.infer<typeof pipelineStageSchema>;

export type ModelClass = "default" | "highCapacity" | "reasoning" | "heuristic";

export type RetryPolicy = {
  maxRetries: number;
  backoffMs: number;
};

export type StageRegistryConfig = {
  id: PipelineStageId;
  displayName: string;
  dependencies: PipelineStageId[];
  retryPolicy: RetryPolicy;
  timeoutMs: number;
  parallelisable: boolean;
  modelClass: ModelClass;
  evaluationProfile: string;
};

export const PIPELINE_STAGE_REGISTRY: Record<PipelineStageId, StageRegistryConfig> = {
  research: {
    id: "research",
    displayName: "Fact & Context Research",
    dependencies: [],
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    timeoutMs: 30_000,
    parallelisable: false,
    modelClass: "default",
    evaluationProfile: "default",
  },
  strategy: {
    id: "strategy",
    displayName: "Strategic Content Positioning",
    dependencies: ["research"],
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    timeoutMs: 30_000,
    parallelisable: false,
    modelClass: "highCapacity",
    evaluationProfile: "default",
  },
  outline: {
    id: "outline",
    displayName: "Article Outline Architecture",
    dependencies: ["strategy"],
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    timeoutMs: 30_000,
    parallelisable: false,
    modelClass: "default",
    evaluationProfile: "default",
  },
  writer: {
    id: "writer",
    displayName: "Prose & Section Generation",
    dependencies: ["outline"],
    retryPolicy: { maxRetries: 3, backoffMs: 1000 },
    timeoutMs: 60_000,
    parallelisable: false,
    modelClass: "highCapacity",
    evaluationProfile: "default",
  },
  editor: {
    id: "editor",
    displayName: "Copy Editing & Formatting",
    dependencies: ["writer"],
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    timeoutMs: 30_000,
    parallelisable: false,
    modelClass: "default",
    evaluationProfile: "default",
  },
  self_review: {
    id: "self_review",
    displayName: "Automated Self-Review & Anti-Repetition",
    dependencies: ["editor"],
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    timeoutMs: 30_000,
    parallelisable: false,
    modelClass: "default",
    evaluationProfile: "default",
  },
  seo_optimizer: {
    id: "seo_optimizer",
    displayName: "SEO & Metadata Optimization",
    dependencies: ["self_review"],
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    timeoutMs: 30_000,
    parallelisable: true,
    modelClass: "default",
    evaluationProfile: "default",
  },
  fact_check: {
    id: "fact_check",
    displayName: "Claim & Source Verification",
    dependencies: ["seo_optimizer", "research"],
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    timeoutMs: 45_000,
    parallelisable: true,
    modelClass: "highCapacity",
    evaluationProfile: "default",
  },
  schema_generator: {
    id: "schema_generator",
    displayName: "Structured JSON-LD Schema Synthesis",
    dependencies: ["seo_optimizer"],
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    timeoutMs: 30_000,
    parallelisable: true,
    modelClass: "default",
    evaluationProfile: "default",
  },
};

export function getPipelineStageConfig(stageId: PipelineStageId): StageRegistryConfig {
  const stage = PIPELINE_STAGE_REGISTRY[stageId];
  if (!stage) {
    throw new Error(`Unknown pipeline stage '${stageId}' in Stage Registry.`);
  }
  return stage;
}

export function getAllPipelineStages(): StageRegistryConfig[] {
  return Object.values(PIPELINE_STAGE_REGISTRY);
}
