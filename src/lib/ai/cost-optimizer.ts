import "server-only";
import type { PipelineStage } from "@/lib/content/pipeline/schemas";

export type ModelRoutingDecision = {
  model: string;
  provider: "openai";
  routingReason: string;
  estimatedCostMultiplier: number;
};

const VALID_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "o3-mini", "o1-mini", "gpt-4-turbo"]);

const STAGE_MODEL_MAP: Record<string, ModelRoutingDecision> = {
  research: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Lightweight entity extraction and context compilation.",
    estimatedCostMultiplier: 0.1,
  },
  strategy: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "High-reasoning strategic outline positioning and search intent mapping.",
    estimatedCostMultiplier: 1.0,
  },
  outline: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Fast structured heading & section generation.",
    estimatedCostMultiplier: 0.1,
  },
  writer: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "High-capacity creative prose synthesis and brand voice adherence.",
    estimatedCostMultiplier: 1.0,
  },
  editor: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Grammar, readability, and structural polisher.",
    estimatedCostMultiplier: 0.1,
  },
  seo_optimizer: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Keyword density analysis and meta header optimization.",
    estimatedCostMultiplier: 0.1,
  },
  fact_check: {
    model: "gpt-4o",
    provider: "openai",
    routingReason: "Precision claim extraction and verification against grounded sources.",
    estimatedCostMultiplier: 1.0,
  },
  schema_generator: {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Structured JSON-LD schema markup synthesis.",
    estimatedCostMultiplier: 0.1,
  },
};

/**
 * Resolves optimal model and provider routing based on pipeline stage complexity.
 * Normalizes stage key names and validates environment overrides.
 */
export function resolveModelRouting(stage: PipelineStage | string): ModelRoutingDecision {
  const normalizedStage = String(stage || "")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");

  const customModelEnv = process.env[`MODEL_OVERRIDE_${normalizedStage.toUpperCase()}`];
  if (customModelEnv && VALID_MODELS.has(customModelEnv)) {
    return {
      model: customModelEnv,
      provider: "openai",
      routingReason: `Validated environment model override specified for stage "${normalizedStage}".`,
      estimatedCostMultiplier: 1.0,
    };
  }

  return STAGE_MODEL_MAP[normalizedStage] || {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Default cost-optimized fallback model for unrecognized or custom pipeline stage.",
    estimatedCostMultiplier: 0.1,
  };
}
