import type { PipelineStage } from "./schemas";

export type StageNodeConfig = {
  stage: PipelineStage;
  dependencies: PipelineStage[];
  canRunInParallel: boolean;
  maxRetries: number;
  backoffMs: number;
};

export const PIPELINE_DAG_NODES: Record<PipelineStage, StageNodeConfig> = {
  research: {
    stage: "research",
    dependencies: [],
    canRunInParallel: false,
    maxRetries: 3,
    backoffMs: 1000,
  },
  strategy: {
    stage: "strategy",
    dependencies: ["research"],
    canRunInParallel: false,
    maxRetries: 3,
    backoffMs: 1000,
  },
  outline: {
    stage: "outline",
    dependencies: ["strategy"],
    canRunInParallel: false,
    maxRetries: 3,
    backoffMs: 1000,
  },
  writer: {
    stage: "writer",
    dependencies: ["outline"],
    canRunInParallel: false,
    maxRetries: 3,
    backoffMs: 1000,
  },
  editor: {
    stage: "editor",
    dependencies: ["writer"],
    canRunInParallel: true,
    maxRetries: 2,
    backoffMs: 1500,
  },
  seo_optimizer: {
    stage: "seo_optimizer",
    dependencies: ["editor"],
    canRunInParallel: true,
    maxRetries: 2,
    backoffMs: 1500,
  },
  fact_check: {
    stage: "fact_check",
    dependencies: ["seo_optimizer", "research"],
    canRunInParallel: true,
    maxRetries: 2,
    backoffMs: 1500,
  },
  schema_generator: {
    stage: "schema_generator",
    dependencies: ["seo_optimizer"],
    canRunInParallel: true,
    maxRetries: 2,
    backoffMs: 1500,
  },
};

/**
 * Builds topological execution levels for the pipeline graph.
 * Stages within the same level can execute concurrently.
 */
export function buildExecutionGraph(): PipelineStage[][] {
  const levels: PipelineStage[][] = [
    ["research"],
    ["strategy"],
    ["outline"],
    ["writer"],
    ["editor"],
    ["seo_optimizer"],
    ["fact_check", "schema_generator"], // Post-writing parallel execution level
  ];
  return levels;
}
