import "server-only";
import { config } from "@/lib/config";
import type { VisibilityAdapter, VisibilityCheckResult } from "@/lib/ai/visibility/adapter";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";

export function createOpenAiVisibilityAdapter(): VisibilityAdapter {
  return {
    platform: "chatgpt",
    isDemo: false,
    adapterState: "live",
    async check(prompt: string, brandName: string): Promise<VisibilityCheckResult> {
      const apiKey = config.openai.apiKey;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }
      const model = config.openai.chatModel;
      const startTime = Date.now();

      const response = await fetch(`${config.openai.apiBaseUrl}${config.openai.chatCompletionsPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
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
        throw new Error(`OpenAI chat completion failed (${response.status}): ${body}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const rawResponse = data.choices[0]?.message?.content ?? "";

      const parsed = parseVisibilityResponse(rawResponse, brandName);
      return {
        platform: "chatgpt",
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
