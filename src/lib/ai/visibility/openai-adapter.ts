import "server-only";
import type { VisibilityAdapter, VisibilityCheckResult } from "@/lib/ai/visibility/adapter";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";

export function createOpenAiVisibilityAdapter(): VisibilityAdapter {
  return {
    platform: "chatgpt",
    isDemo: false,
    adapterState: "live",
    async check(prompt: string, brandName: string): Promise<VisibilityCheckResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }
      const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
      const startTime = Date.now();

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
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
