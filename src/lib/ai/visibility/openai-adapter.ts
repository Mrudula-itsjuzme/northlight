import "server-only";
import type { VisibilityAdapter, VisibilityCheckResult } from "@/lib/ai/visibility/adapter";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";

/**
 * Real ChatGPT-equivalent adapter: actually calls the OpenAI Chat
 * Completions API and parses the response with the same
 * `parseVisibilityResponse` function the demo adapter uses. Only
 * constructed/used when `OPENAI_API_KEY` is configured (see
 * `getVisibilityAdapters` in registry.ts) — this file must never be
 * called without a key, and never fakes a response if the API call
 * fails; errors propagate to the caller. Per the plan's single-provider
 * constraint, this is the ONLY platform with a real adapter; all other
 * platforms (claude/gemini/perplexity/copilot/ai_overviews) remain
 * demo-only regardless of which keys are configured, since no other
 * provider integration is in scope.
 */
export function createOpenAiVisibilityAdapter(): VisibilityAdapter {
  return {
    platform: "chatgpt",
    isDemo: false,
    async check(prompt: string, brandName: string): Promise<VisibilityCheckResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
      }
      const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

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
        mentioned: parsed.mentioned,
        position: parsed.position,
        sentiment: parsed.sentiment,
        confidence: parsed.confidence,
        rawResponse,
        isDemo: false,
      };
    },
  };
}
