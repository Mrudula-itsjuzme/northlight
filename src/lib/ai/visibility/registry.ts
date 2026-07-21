import "server-only";
import { AI_PLATFORM_KEYS, type AiPlatformKey, type VisibilityAdapter } from "@/lib/ai/visibility/adapter";
import { createDemoVisibilityAdapter } from "@/lib/ai/visibility/demo-adapter";
import { createOpenAiVisibilityAdapter } from "@/lib/ai/visibility/openai-adapter";

/**
 * Returns the adapter to use for a given platform. Only `chatgpt` ever
 * gets a real adapter, and only when `OPENAI_API_KEY` is configured —
 * every other platform (claude/gemini/perplexity/copilot/ai_overviews)
 * is always demo, since this app integrates exactly one real LLM
 * provider per the plan's constraints.
 */
export function getVisibilityAdapter(platform: AiPlatformKey): VisibilityAdapter {
  if (platform === "chatgpt" && process.env.OPENAI_API_KEY) {
    return createOpenAiVisibilityAdapter();
  }
  return createDemoVisibilityAdapter(platform);
}

export function getAllVisibilityAdapters(): VisibilityAdapter[] {
  return AI_PLATFORM_KEYS.map((platform) => getVisibilityAdapter(platform));
}
