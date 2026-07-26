import "server-only";
import type { PipelineStage } from "@/db/schema/enums";

export type ModelRoutingDecision = {
  model: string;
  provider: "openai";
  routingReason: string;
  estimatedCostMultiplier: number;
};

const STAGE_MODEL_MAP: Record<PipelineStage, ModelRoutingDecision> = {
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
 */
export function resolveModelRouting(stage: PipelineStage): ModelRoutingDecision {
  const customModelEnv = process.env[`MODEL_OVERRIDE_${stage.toUpperCase()}`];
  if (customModelEnv) {
    return {
      model: customModelEnv,
      provider: "openai",
      routingReason: `Environment model override specified for stage "${stage}".`,
      estimatedCostMultiplier: 1.0,
    };
  }

  return STAGE_MODEL_MAP[stage] || {
    model: "gpt-4o-mini",
    provider: "openai",
    routingReason: "Default cost-optimized fallback model.",
    estimatedCostMultiplier: 0.1,
  };
}
