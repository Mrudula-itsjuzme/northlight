import "server-only";
import { config } from "@/lib/config";
import type { PipelineStage } from "@/lib/content/pipeline/schemas";

export type ModelRoutingOptions = {
  estimatedTokens?: number;
  complexity?: "low" | "medium" | "high" | "critical";
  taskComplexity?: "low" | "medium" | "high" | "critical" | "standard";
  tenantBudgetExceeded?: boolean;
  historicalLatencyMs?: number;
};

export type ModelRoutingDecision = {
  model: string;
  provider: "openai";
  routingReason: string;
  estimatedCostMultiplier: number;
  routingMetadata: {
    stage: string;
    complexity: string;
    budgetConstrained: boolean;
    overrideApplied: boolean;
  };
};

import { aiConfig } from "@/config/ai";
import { PIPELINE_STAGE_REGISTRY } from "@/config/pipeline";

const VALID_MODELS = new Set(aiConfig.costOptimizer.validModels);

const STAGE_MODEL_MAP: Record<string, ModelRoutingDecision> = Object.fromEntries(
  Object.entries(PIPELINE_STAGE_REGISTRY).map(([id, cfg]) => {
    const isHigh = cfg.modelClass === "highCapacity";
    const model = isHigh ? config.ai.costOptimizer.highCapacityModel : config.ai.costOptimizer.defaultModel;
    const estimatedCostMultiplier = isHigh ? 1.0 : 0.1;
    const complexity = id === "fact_check" ? "critical" : isHigh ? "high" : "low";

    return [
      id,
      {
        model,
        provider: "openai" as const,
        routingReason: `${cfg.displayName} stage routing via Pipeline Registry.`,
        estimatedCostMultiplier,
        routingMetadata: { stage: id, complexity, budgetConstrained: false, overrideApplied: false },
      },
    ];
  }),
);

/**
 * Resolves optimal model and provider routing based on stage, estimated tokens, complexity, and tenant budget limits.
 */
export function resolveModelRouting(
  stage: PipelineStage | string,
  options?: ModelRoutingOptions,
): ModelRoutingDecision {
  const normalizedStage = String(stage || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");

  // 1. Admin Environment Model Override check
  const customModelEnv = process.env[`MODEL_OVERRIDE_${normalizedStage.toUpperCase()}`];
  if (customModelEnv && VALID_MODELS.has(customModelEnv)) {
    return {
      model: customModelEnv,
      provider: "openai",
      routingReason: `Validated environment model override specified for stage "${normalizedStage}".`,
      estimatedCostMultiplier: 1.0,
      routingMetadata: {
        stage: normalizedStage,
        complexity: options?.complexity || "override",
        budgetConstrained: false,
        overrideApplied: true,
      },
    };
  }

  // 2. Budget Limit Constraints check
  if (options?.tenantBudgetExceeded) {
    return {
      model: config.ai.costOptimizer.defaultModel,
      provider: "openai",
      routingReason: `Tenant monthly budget limit exceeded for stage "${normalizedStage}"; forced cost-aware fallback.`,
      estimatedCostMultiplier: 0.1,
      routingMetadata: {
        stage: normalizedStage,
        complexity: options.complexity || "medium",
        budgetConstrained: true,
        overrideApplied: false,
      },
    };
  }

  // 3. High Token / Critical Complexity Routing check
  if (options?.complexity === "critical" || (options?.estimatedTokens && options.estimatedTokens > config.ai.costOptimizer.tokenThresholdHigh)) {
    return {
      model: config.ai.costOptimizer.highCapacityModel,
      provider: "openai",
      routingReason: `High payload complexity (${options.estimatedTokens ?? "N/A"} tokens) routed to high-capacity reasoning model.`,
      estimatedCostMultiplier: 1.0,
      routingMetadata: {
        stage: normalizedStage,
        complexity: "critical",
        budgetConstrained: false,
        overrideApplied: false,
      },
    };
  }

  const defaultDecision = STAGE_MODEL_MAP[normalizedStage];
  if (defaultDecision) return defaultDecision;

  return {
    model: config.ai.costOptimizer.defaultModel,
    provider: "openai",
    routingReason: "Default cost-optimized fallback model for unrecognized pipeline stage.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: {
      stage: normalizedStage,
      complexity: "low",
      budgetConstrained: false,
      overrideApplied: false,
    },
  };
}
