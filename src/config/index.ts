import "server-only";
import { aiConfig, aiConfigSchema } from "./ai";
import { PIPELINE_STAGE_REGISTRY } from "./pipeline";
import { cacheConfig, cacheConfigSchema } from "./cache";
import { EVALUATION_PROFILES } from "./evaluation";
import { VISIBILITY_PLATFORMS, visibilityConfig, visibilityConfigSchema } from "./visibility";
import { DEFAULT_KG_PROFILE } from "./knowledgeGraph";
import { limitsConfig, limitsConfigSchema } from "./limits";
import { jobsConfig, jobsConfigSchema } from "./jobs";
import { FEATURE_FLAGS_REGISTRY } from "./featureFlags";
import { PROVIDER_REGISTRY } from "./providers";

export * from "./providers";
export * from "./ai";
export * from "./pipeline";
export * from "./cache";
export * from "./evaluation";
export * from "./visibility";
export * from "./knowledgeGraph";
export * from "./limits";
export * from "./jobs";
export * from "./featureFlags";

/**
 * Validates configuration schemas across all modules and fails fast if invalid.
 */
export function validateConfiguration(): void {
  aiConfigSchema.parse(aiConfig);
  cacheConfigSchema.parse(cacheConfig);
  visibilityConfigSchema.parse(visibilityConfig);
  limitsConfigSchema.parse(limitsConfig);
  jobsConfigSchema.parse(jobsConfig);

  if (Object.keys(PROVIDER_REGISTRY).length === 0) {
    throw new Error("Validation Error: Provider Registry is empty.");
  }
  if (Object.keys(PIPELINE_STAGE_REGISTRY).length === 0) {
    throw new Error("Validation Error: Pipeline Stage Registry is empty.");
  }
  if (Object.keys(EVALUATION_PROFILES).length === 0) {
    throw new Error("Validation Error: Evaluation Profiles Registry is empty.");
  }
  if (Object.keys(VISIBILITY_PLATFORMS).length === 0) {
    throw new Error("Validation Error: Visibility Platforms Registry is empty.");
  }
  if (!DEFAULT_KG_PROFILE) {
    throw new Error("Validation Error: Default Knowledge Graph extraction profile is missing.");
  }
  if (Object.keys(FEATURE_FLAGS_REGISTRY).length === 0) {
    throw new Error("Validation Error: Feature Flags Registry is empty.");
  }
}

// Fail fast on module load
validateConfiguration();

export const config = {
  openai: {
    get apiKey() {
      return process.env.OPENAI_API_KEY || aiConfig.openai.apiKey;
    },
    get chatModel() {
      return process.env.OPENAI_CHAT_MODEL || aiConfig.openai.chatModel;
    },
    get embeddingModel() {
      return process.env.OPENAI_EMBEDDING_MODEL || aiConfig.openai.embeddingModel;
    },
    get apiBaseUrl() {
      return process.env.OPENAI_API_BASE_URL || aiConfig.openai.apiBaseUrl;
    },
    chatCompletionsPath: aiConfig.openai.chatCompletionsPath,
    embeddingsPath: aiConfig.openai.embeddingsPath,
    defaultTimeoutMs: aiConfig.openai.defaultTimeoutMs,
    maxRetries: aiConfig.openai.maxRetries,
    temperature: aiConfig.openai.temperature,
    visibilityTemperature: aiConfig.openai.visibilityTemperature,
  },
  app: limitsConfig.app,
  supabase: {
    get url() {
      return process.env.NEXT_PUBLIC_SUPABASE_URL;
    },
    get anonKey() {
      return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    },
    get serviceRoleKey() {
      return process.env.SUPABASE_SERVICE_ROLE_KEY;
    },
    get databaseUrl() {
      return process.env.DATABASE_URL;
    },
  },
  jobs: {
    get workerSecret() {
      return jobsConfig.workerSecret;
    },
    maxJobsPerRun: jobsConfig.maxJobsPerRun,
    claimStaleAfterMs: jobsConfig.claimStaleAfterMs,
    retryBackoffMs: jobsConfig.retryBackoffMs,
    defaultMaxAttempts: jobsConfig.defaultMaxAttempts,
  },
  ai: {
    get executionMode() {
      const envMode = process.env.AI_EXECUTION_MODE?.toLowerCase();
      if (envMode === "live" || envMode === "demo" || envMode === "test") {
        return envMode;
      }
      return process.env.OPENAI_API_KEY ? "live" : "demo";
    },
    embeddingDimensions: aiConfig.embeddings.dimensions,
    maxUploadBytes: aiConfig.embeddings.maxUploadBytes,
    defaultChunkSize: aiConfig.embeddings.defaultChunkSize,
    defaultChunkOverlap: aiConfig.embeddings.defaultChunkOverlap,
    costOptimizer: {
      tokenThresholdHigh: aiConfig.costOptimizer.tokenThresholdHigh,
      defaultModel: aiConfig.costOptimizer.defaultModel,
      highCapacityModel: aiConfig.costOptimizer.highCapacityModel,
    },
  },
  rateLimits: limitsConfig.rateLimits,
  competitor: limitsConfig.competitor,
  publishing: limitsConfig.publishing,
  brand: limitsConfig.brand,
  cookie: limitsConfig.cookie,
  invite: limitsConfig.invite,
  cache: cacheConfig,
} as const;

export type UnifiedConfig = typeof config;
