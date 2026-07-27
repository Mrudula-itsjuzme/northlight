import "server-only";
import { type z } from "zod";
import { config } from "@/lib/config";

export type ExecutionMode = "live" | "demo" | "test";

export type LlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
};

export type LlmResult<T> = {
  data: T;
  model: string;
  provider: "openai" | "demo";
  promptVersion: string;
  usage: LlmUsage;
  durationMs: number;
  usedDemoAdapter: boolean;
};

export type LlmCallOptions<T> = {
  systemPrompt?: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  promptVersion?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fallbackGenerator?: () => T;
};

import { calculateModelCostCents } from "@/config/providers";
import { aiConfig } from "@/config/ai";

export function getExecutionMode(): ExecutionMode {
  const envMode = process.env.AI_EXECUTION_MODE?.toLowerCase();
  if (envMode === "live" || envMode === "demo" || envMode === "test") {
    return envMode as ExecutionMode;
  }
  return config.openai.apiKey ? "live" : "demo";
}

function calculateCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  return calculateModelCostCents(model, promptTokens, completionTokens, "openai");
}

export async function executeLlmCall<T>(
  options: LlmCallOptions<T>,
): Promise<LlmResult<T>> {
  const mode = getExecutionMode();
  const startTime = Date.now();
  const promptVersion = options.promptVersion ?? aiConfig.prompts.defaultVersion;

  if (mode === "demo" || mode === "test") {
    if (!options.fallbackGenerator) {
      throw new Error(`Execution mode '${mode}' requires a fallbackGenerator.`);
    }
    const data = options.fallbackGenerator();
    return {
      data,
      model: "demo-heuristic",
      provider: "demo",
      promptVersion,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostCents: 0,
      },
      durationMs: Date.now() - startTime,
      usedDemoAdapter: true,
    };
  }

  // Live mode
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new Error(
      "AI_EXECUTION_MODE is set to 'live' but OPENAI_API_KEY is not configured in the environment.",
    );
  }

  const model = options.model ?? config.openai.chatModel;
  const timeoutMs = options.timeoutMs ?? config.openai.defaultTimeoutMs;
  const maxRetries = options.maxRetries ?? config.openai.maxRetries;

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({
    role: "user",
    content: `${options.userPrompt}\n\nIMPORTANT: Respond ONLY with a valid JSON object matching the requested schema without markdown quotes or formatting.`,
  });

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.openai.apiBaseUrl}${config.openai.chatCompletionsPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: config.openai.temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // Do not retry 401/403 or 400 client errors blindly
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          throw new Error(
            `OpenAI API request rejected (${response.status}): ${errorText}`,
          );
        }
        throw new Error(`OpenAI API HTTP ${response.status}: ${errorText}`);
      }

      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const rawContent = json.choices[0]?.message?.content;
      if (!rawContent) {
        throw new Error("OpenAI API returned empty response content.");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawContent);
      } catch (parseErr) {
        throw new Error(`Failed to parse JSON response from OpenAI: ${(parseErr as Error).message}`);
      }

      // Validate schema (never retry schema validation failure)
      const validatedData = options.schema.parse(parsedJson);

      const promptTokens = json.usage?.prompt_tokens ?? 0;
      const completionTokens = json.usage?.completion_tokens ?? 0;
      const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;
      const estimatedCostCents = calculateCostCents(model, promptTokens, completionTokens);

      return {
        data: validatedData,
        model,
        provider: "openai",
        promptVersion,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimatedCostCents,
        },
        durationMs: Date.now() - startTime,
        usedDemoAdapter: false,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err as Error;

      // Fail fast on schema validation errors or auth errors
      if (
        lastError.name === "ZodError" ||
        lastError.message.includes("schema") ||
        lastError.message.includes("401") ||
        lastError.message.includes("403")
      ) {
        throw lastError;
      }

      if (attempt <= maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 500;
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }
  }

  throw lastError ?? new Error("LLM execution failed after retries.");
}
