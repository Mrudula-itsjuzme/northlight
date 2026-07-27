import "server-only";
import { z } from "zod";

export const featureFlagKeySchema = z.enum([
  "enableDeepKnowledgeGraph",
  "enableParallelPipelineStages",
  "enableLLMEvaluation",
  "enableRealtimeVisibilityAlerts",
  "enableCostAwareFallback",
  "enableExperimentalPrompts",
]);

export type FeatureFlagKey = z.infer<typeof featureFlagKeySchema>;

export type FlagEvaluationContext = {
  brandId?: string;
  workspaceId?: string;
  environment?: string;
};

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  description: string;
  defaultValue: boolean;
  globalEnvOverride?: string;
};

export const FEATURE_FLAGS_REGISTRY: Record<FeatureFlagKey, FeatureFlagDefinition> = {
  enableDeepKnowledgeGraph: {
    key: "enableDeepKnowledgeGraph",
    description: "Enables deep multi-hop entity relationship extraction in Knowledge Graph",
    defaultValue: true,
    globalEnvOverride: "FEATURE_DEEP_KG",
  },
  enableParallelPipelineStages: {
    key: "enableParallelPipelineStages",
    description: "Enables concurrent execution of independent DAG topological level stages",
    defaultValue: true,
    globalEnvOverride: "FEATURE_PARALLEL_PIPELINE",
  },
  enableLLMEvaluation: {
    key: "enableLLMEvaluation",
    description: "Enables full automated evaluation persistence after pipeline runs",
    defaultValue: true,
    globalEnvOverride: "FEATURE_LLM_EVALUATION",
  },
  enableRealtimeVisibilityAlerts: {
    key: "enableRealtimeVisibilityAlerts",
    description: "Triggers instant visibility drop alerts on snapshot processing",
    defaultValue: true,
    globalEnvOverride: "FEATURE_VISIBILITY_ALERTS",
  },
  enableCostAwareFallback: {
    key: "enableCostAwareFallback",
    description: "Automatically routes to default model when tenant monthly budget is reached",
    defaultValue: true,
    globalEnvOverride: "FEATURE_COST_AWARE_FALLBACK",
  },
  enableExperimentalPrompts: {
    key: "enableExperimentalPrompts",
    description: "Enables v3 experimental prompt templates for pipeline stages",
    defaultValue: false,
    globalEnvOverride: "FEATURE_EXPERIMENTAL_PROMPTS",
  },
};

// Brand & Workspace override registries
const BRAND_FLAG_OVERRIDES = new Map<string, Partial<Record<FeatureFlagKey, boolean>>>();
const WORKSPACE_FLAG_OVERRIDES = new Map<string, Partial<Record<FeatureFlagKey, boolean>>>();

export function isFeatureEnabled(flagKey: FeatureFlagKey, context?: FlagEvaluationContext): boolean {
  const flag = FEATURE_FLAGS_REGISTRY[flagKey];
  if (!flag) return false;

  // 1. Brand-level override
  if (context?.brandId) {
    const brandOverrides = BRAND_FLAG_OVERRIDES.get(context.brandId);
    if (brandOverrides && flagKey in brandOverrides) {
      return Boolean(brandOverrides[flagKey]);
    }
  }

  // 2. Workspace-level override
  if (context?.workspaceId) {
    const wsOverrides = WORKSPACE_FLAG_OVERRIDES.get(context.workspaceId);
    if (wsOverrides && flagKey in wsOverrides) {
      return Boolean(wsOverrides[flagKey]);
    }
  }

  // 3. Environment Variable override
  if (flag.globalEnvOverride) {
    const envVal = process.env[flag.globalEnvOverride]?.toLowerCase();
    if (envVal === "true" || envVal === "1") return true;
    if (envVal === "false" || envVal === "0") return false;
  }

  // 4. Global default
  return flag.defaultValue;
}

export function setBrandFlagOverride(brandId: string, flagKey: FeatureFlagKey, enabled: boolean): void {
  const existing = BRAND_FLAG_OVERRIDES.get(brandId) || {};
  existing[flagKey] = enabled;
  BRAND_FLAG_OVERRIDES.set(brandId, existing);
}

export function setWorkspaceFlagOverride(workspaceId: string, flagKey: FeatureFlagKey, enabled: boolean): void {
  const existing = WORKSPACE_FLAG_OVERRIDES.get(workspaceId) || {};
  existing[flagKey] = enabled;
  WORKSPACE_FLAG_OVERRIDES.set(workspaceId, existing);
}
