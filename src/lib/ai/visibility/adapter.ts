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

export type VisibilityCheckResult = {
  platform: AiPlatformKey;
  mentioned: boolean;
  position: number | null; // 1-based rank among mentioned brands, null if not mentioned
  sentiment: Sentiment;
  confidence: number; // 0-1, the PARSER's own extraction confidence — not a guarantee
  rawResponse: string;
  isDemo: boolean;
};

/**
 * Provider adapter interface for an AI Visibility check: given a prompt
 * and a brand name, return whether/where/how the brand was mentioned in
 * that platform's answer to the prompt. Every adapter — demo or real —
 * implements this same shape so the rest of the app (snapshot storage,
 * UI) never needs to branch on which adapter produced a result. AI
 * Visibility is DIRECTIONAL ONLY: `confidence` reflects the parser's own
 * certainty about what it extracted from the response text, never an
 * official or authoritative citation count. See AI_SCORING.md's
 * methodology section.
 */
export interface VisibilityAdapter {
  readonly platform: AiPlatformKey;
  readonly isDemo: boolean;
  check(prompt: string, brandName: string): Promise<VisibilityCheckResult>;
}
