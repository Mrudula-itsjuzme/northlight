import "server-only";
import { z } from "zod";

export const aiPlatformKeySchema = z.enum([
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "copilot",
  "ai_overviews",
]);

export type AiPlatformKey = z.infer<typeof aiPlatformKeySchema>;

export type PlatformVisibilityConfig = {
  key: AiPlatformKey;
  displayName: string;
  hasLiveProvider: boolean;
  priority: number;
};

export const VISIBILITY_PLATFORMS: Record<AiPlatformKey, PlatformVisibilityConfig> = {
  chatgpt: {
    key: "chatgpt",
    displayName: "ChatGPT",
    hasLiveProvider: true,
    priority: 1,
  },
  claude: {
    key: "claude",
    displayName: "Anthropic Claude",
    hasLiveProvider: true,
    priority: 2,
  },
  gemini: {
    key: "gemini",
    displayName: "Google Gemini",
    hasLiveProvider: true,
    priority: 3,
  },
  perplexity: {
    key: "perplexity",
    displayName: "Perplexity AI",
    hasLiveProvider: true,
    priority: 4,
  },
  copilot: {
    key: "copilot",
    displayName: "Microsoft Copilot",
    hasLiveProvider: true,
    priority: 5,
  },
  ai_overviews: {
    key: "ai_overviews",
    displayName: "Google AI Overviews",
    hasLiveProvider: true,
    priority: 6,
  },
};

export const visibilityConfigSchema = z.object({
  refreshIntervalMs: z.number().positive().default(60_000),
  defaultSentiment: z.enum(["positive", "neutral", "negative", "unknown"]).default("unknown"),
  snapshotRateLimitWindowMs: z.number().positive().default(60_000),
  maxPromptsPerBatch: z.number().positive().default(10),
});

export type VisibilityConfig = z.infer<typeof visibilityConfigSchema>;

export const visibilityConfig = visibilityConfigSchema.parse({
  refreshIntervalMs: 60_000,
  defaultSentiment: "unknown",
  snapshotRateLimitWindowMs: 60_000,
  maxPromptsPerBatch: 10,
});
