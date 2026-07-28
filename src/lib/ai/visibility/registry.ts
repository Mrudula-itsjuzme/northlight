import "server-only";
import { AI_PLATFORM_KEYS, type AiPlatformKey, type VisibilityAdapter } from "@/lib/ai/visibility/adapter";
import { createDemoVisibilityAdapter, createUnavailableVisibilityAdapter } from "@/lib/ai/visibility/demo-adapter";
import { createOpenAiVisibilityAdapter } from "@/lib/ai/visibility/openai-adapter";
import { getExecutionMode } from "@/lib/ai/llm";
import { VISIBILITY_PLATFORMS } from "@/config/visibility";

export function getVisibilityAdapter(platform: AiPlatformKey): VisibilityAdapter {
  const mode = getExecutionMode();
  const platformConfig = VISIBILITY_PLATFORMS[platform];
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;

  if (platformConfig?.hasLiveProvider) {
    if (mode === "live" && apiKey) {
      return createOpenAiVisibilityAdapter(platform);
    }
    if (mode === "live" && !apiKey) {
      return createUnavailableVisibilityAdapter(platform);
    }
    return createDemoVisibilityAdapter(platform);
  }

  // Non-live-provider platforms in live mode are explicitly unavailable
  if (mode === "live") {
    return createUnavailableVisibilityAdapter(platform);
  }

  return createDemoVisibilityAdapter(platform);
}

export function getAllVisibilityAdapters(): VisibilityAdapter[] {
  return AI_PLATFORM_KEYS.map((platform) => getVisibilityAdapter(platform));
}
