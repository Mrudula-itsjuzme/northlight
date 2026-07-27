import "server-only";
import { z } from "zod";

function getEnv(key: string): string | undefined {
  const val = process.env[key];
  return val === undefined || val === "" ? undefined : val;
}

export const aiConfigSchema = z.object({
  openai: z.object({
    apiKey: z.string().optional(),
    chatModel: z.string().default("gpt-4o-mini"),
    embeddingModel: z.string().default("text-embedding-3-small"),
    apiBaseUrl: z.string().url().default("https://api.openai.com/v1"),
    chatCompletionsPath: z.string().default("/chat/completions"),
    embeddingsPath: z.string().default("/embeddings"),
    defaultTimeoutMs: z.number().positive().default(30_000),
    maxRetries: z.number().min(0).default(2),
    initialBackoffMs: z.number().positive().default(500),
    backoffMultiplier: z.number().positive().default(2),
    temperature: z.number().min(0).max(2).default(0.2),
    visibilityTemperature: z.number().min(0).max(2).default(0.3),
  }),
  prompts: z.object({
    defaultVersion: z.string().default("2.0"),
    stageVersions: z.record(z.string(), z.string()).default({
      research: "2.0",
      strategy: "2.0",
      outline: "2.0",
      writer: "2.0",
      editor: "2.0",
      seo_optimizer: "2.0",
      fact_check: "2.0",
      schema_generator: "2.0",
    }),
  }),
  costOptimizer: z.object({
    tokenThresholdHigh: z.number().positive().default(8000),
    defaultModel: z.string().default("gpt-4o-mini"),
    highCapacityModel: z.string().default("gpt-4o"),
    validModels: z.array(z.string()).default([
      "gpt-4o-mini",
      "gpt-4o",
      "o3-mini",
      "o1-mini",
      "gpt-4-turbo",
    ]),
  }),
  embeddings: z.object({
    dimensions: z.number().positive().default(1536),
    maxUploadBytes: z.number().positive().default(10 * 1024 * 1024),
    defaultChunkSize: z.number().positive().default(1000),
    defaultChunkOverlap: z.number().min(0).default(150),
  }),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const aiConfig = aiConfigSchema.parse({
  openai: {
    apiKey: getEnv("OPENAI_API_KEY"),
    chatModel: getEnv("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini",
    embeddingModel: getEnv("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small",
    apiBaseUrl: getEnv("OPENAI_API_BASE_URL") ?? "https://api.openai.com/v1",
    chatCompletionsPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    defaultTimeoutMs: 30_000,
    maxRetries: 2,
    initialBackoffMs: 500,
    backoffMultiplier: 2,
    temperature: 0.2,
    visibilityTemperature: 0.3,
  },
  prompts: {
    defaultVersion: "2.0",
    stageVersions: {
      research: "2.0",
      strategy: "2.0",
      outline: "2.0",
      writer: "2.0",
      editor: "2.0",
      seo_optimizer: "2.0",
      fact_check: "2.0",
      schema_generator: "2.0",
    },
  },
  costOptimizer: {
    tokenThresholdHigh: 8000,
    defaultModel: "gpt-4o-mini",
    highCapacityModel: "gpt-4o",
    validModels: [
      "gpt-4o-mini",
      "gpt-4o",
      "o3-mini",
      "o1-mini",
      "gpt-4-turbo",
    ],
  },
  embeddings: {
    dimensions: 1536,
    maxUploadBytes: 10 * 1024 * 1024,
    defaultChunkSize: 1000,
    defaultChunkOverlap: 150,
  },
});
