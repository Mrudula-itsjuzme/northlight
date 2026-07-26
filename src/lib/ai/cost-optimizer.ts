import "server-only";
import type { PipelineStage } from "@/lib/content/pipeline/schemas";

export type ModelRoutingOptions = {
  estimatedTokens?: number;
  complexity?: "low" | "medium" | "high" | "critical";
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

const VALID_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "o3-mini", "o1-mini", "gpt-4-turbo"]);

const STAGE_MODEL_MAP: Record<string, ModelRoutingDecision> = {
  research: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Lightweight entity extraction and context compilation.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: { stage: "research", complexity: "low", budgetConstrained: false, overrideApplied: false },
  },
  strategy: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "High-reasoning strategic outline positioning and search intent mapping.",
    estimatedCostMultiplier: 1.0,
    routingMetadata: { stage: "strategy", complexity: "high", budgetConstrained: false, overrideApplied: false },
  },
  outline: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Fast structured heading & section generation.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: { stage: "outline", complexity: "low", budgetConstrained: false, overrideApplied: false },
  },
  writer: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "High-capacity creative prose synthesis and brand voice adherence.",
    estimatedCostMultiplier: 1.0,
    routingMetadata: { stage: "writer", complexity: "high", budgetConstrained: false, overrideApplied: false },
  },
  editor: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Grammar, readability, and structural polisher.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: { stage: "editor", complexity: "low", budgetConstrained: false, overrideApplied: false },
  },
  seo_optimizer: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Keyword density analysis and meta header optimization.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: { stage: "seo_optimizer", complexity: "low", budgetConstrained: false, overrideApplied: false },
  },
  fact_check: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "Precision claim extraction and verification against grounded sources.",
    estimatedCostMultiplier: 1.0,
    routingMetadata: { stage: "fact_check", complexity: "critical", budgetConstrained: false, overrideApplied: false },
  },
  schema_generator: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Structured JSON-LD schema markup synthesis.",
    estimatedCostMultiplier: 0.1,
    routingMetadata: { stage: "schema_generator", complexity: "low", budgetConstrained: false, overrideApplied: false },
  },
};

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
      model: "gpt-4o-mini",
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
  if (options?.complexity === "critical" || (options?.estimatedTokens && options.estimatedTokens > 8000)) {
    return {
      model: "gpt-4o",
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
    model: "gpt-4o-mini",
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
