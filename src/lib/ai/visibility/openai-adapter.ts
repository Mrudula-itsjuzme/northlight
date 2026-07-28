import "server-only";
import { config } from "@/lib/config";
import type { AiPlatformKey, VisibilityAdapter, VisibilityCheckResult } from "@/lib/ai/visibility/adapter";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";

const PLATFORM_MODEL_MAP: Record<AiPlatformKey, string> = {
  chatgpt: "openai/gpt-4o-mini",
  claude: "anthropic/claude-3.5-sonnet",
  gemini: "google/gemini-2.0-flash-001",
  perplexity: "perplexity/sonar",
  copilot: "openai/gpt-4o",
  ai_overviews: "google/gemini-2.0-flash-001",
};

export function createOpenAiVisibilityAdapter(platform: AiPlatformKey = "chatgpt"): VisibilityAdapter {
  return {
    platform,
    isDemo: false,
    adapterState: "live",
    async check(prompt: string, brandName: string): Promise<VisibilityCheckResult> {
      const apiKey = config.openai.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY or OPENROUTER_API_KEY is not configured.");
      }
      const model = PLATFORM_MODEL_MAP[platform] ?? config.openai.chatModel;
      const startTime = Date.now();

      const response = await fetch(`${config.openai.apiBaseUrl}${config.openai.chatCompletionsPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "Northlight",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: config.openai.visibilityTemperature,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Live API chat completion failed for platform ${platform} (${response.status}): ${body}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const rawResponse = data.choices[0]?.message?.content ?? "";

      const parsed = parseVisibilityResponse(rawResponse, brandName);
      return {
        platform,
        adapterState: "live",
        mentioned: parsed.mentioned,
        position: parsed.position,
        sentiment: parsed.sentiment,
        confidence: parsed.confidence,
        rawResponse,
        isDemo: false,
        model,
        latencyMs,
      };
    },
  };
}
