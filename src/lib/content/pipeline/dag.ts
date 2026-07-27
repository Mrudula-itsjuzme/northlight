import { PIPELINE_STAGE_REGISTRY } from "@/config/pipeline";
import type { PipelineStage } from "./schemas";

export type StageNodeConfig = {
  stage: PipelineStage;
  dependencies: PipelineStage[];
  canRunInParallel: boolean;
  maxRetries: number;
  backoffMs: number;
};

export const PIPELINE_DAG_NODES: Record<PipelineStage, StageNodeConfig> = Object.fromEntries(
  Object.entries(PIPELINE_STAGE_REGISTRY).map(([id, cfg]) => [
    id,
    {
      stage: id as PipelineStage,
      dependencies: cfg.dependencies as PipelineStage[],
      canRunInParallel: cfg.parallelisable,
      maxRetries: cfg.retryPolicy.maxRetries,
      backoffMs: cfg.retryPolicy.backoffMs,
    },
  ]),
) as Record<PipelineStage, StageNodeConfig>;

/**
 * Validates graph structure and computes topological execution levels dynamically using Kahn's Algorithm.
 * Throws explicit errors for missing dependencies or cycles.
 */
export function computeTopologicalLevels<K extends string = PipelineStage>(
  nodesMap: Record<K, StageNodeConfig>,
): K[][] {
  const nodeKeys = Object.keys(nodesMap) as K[];
  const inDegree: Record<string, number> = {};
  const graph: Record<string, string[]> = {};

  // 1. Initialize adjacency list & in-degrees
  for (const key of nodeKeys) {
    inDegree[key] = 0;
    graph[key] = [];
  }

  // 2. Build graph edges and calculate in-degrees; validate missing dependencies
  for (const key of nodeKeys) {
    const config = nodesMap[key];
    for (const dep of config.dependencies) {
      if (!nodesMap[dep as K]) {
        throw new Error(`DAG Error: Stage "${key}" depends on missing stage "${dep}".`);
      }
      graph[dep].push(key);
      inDegree[key] = (inDegree[key] || 0) + 1;
    }
  }

  // 3. Perform Level-by-Level Kahn's Topological Sort
  const levels: K[][] = [];
  let currentQueue = nodeKeys.filter((k) => inDegree[k] === 0);
  let processedCount = 0;

  while (currentQueue.length > 0) {
    // Sort current level alphabetically for deterministic execution
    currentQueue.sort();
    levels.push([...currentQueue]);
    processedCount += currentQueue.length;

    const nextQueue: K[] = [];
    for (const u of currentQueue) {
      for (const v of graph[u]) {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          nextQueue.push(v as K);
        }
      }
    }
    currentQueue = nextQueue;
  }

  // 4. Cycle Detection Check
  if (processedCount < nodeKeys.length) {
    const unvisited = nodeKeys.filter((k) => inDegree[k] > 0);
    throw new Error(`DAG Cycle Detected: Cyclic dependency involving stages: [${unvisited.join(", ")}].`);
  }

  return levels;
}

/**
 * Dynamically builds topological execution levels from DAG configuration.
 */
export function buildExecutionGraph(
  customNodes?: Record<string, StageNodeConfig>,
): PipelineStage[][] {
  const nodes = customNodes || (PIPELINE_DAG_NODES as Record<string, StageNodeConfig>);
  return computeTopologicalLevels(nodes as Record<PipelineStage, StageNodeConfig>);
}
