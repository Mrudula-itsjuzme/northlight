export type AiPlatformKey =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "copilot"
  | "ai_overviews";

export const AI_PLATFORM_KEYS: AiPlatformKey[] = [
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "copilot",
  "ai_overviews",
];

export type Sentiment = "positive" | "neutral" | "negative" | "unknown";
export type VisibilityAdapterState = "live" | "estimated" | "demo" | "unavailable";

export type VisibilityCheckResult = {
  platform: AiPlatformKey;
  adapterState: VisibilityAdapterState;
  mentioned: boolean;
  position: number | null; // 1-based rank among mentioned brands, null if not mentioned
  sentiment: Sentiment;
  confidence: number; // 0-1, the PARSER's own extraction confidence
  rawResponse: string;
  isDemo: boolean;
  model?: string;
  latencyMs?: number;
};

export interface VisibilityAdapter {
  readonly platform: AiPlatformKey;
  readonly isDemo: boolean;
  readonly adapterState: VisibilityAdapterState;
  check(prompt: string, brandName: string): Promise<VisibilityCheckResult>;
}
