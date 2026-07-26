import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { executeLlmCall, getExecutionMode } from "@/lib/ai/llm";

describe("LLM Gateway (src/lib/ai/llm.ts)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("defaults to demo mode when AI_EXECUTION_MODE and OPENAI_API_KEY are absent", () => {
    delete process.env.AI_EXECUTION_MODE;
    delete process.env.OPENAI_API_KEY;
    expect(getExecutionMode()).toBe("demo");
  });

  it("respects explicit AI_EXECUTION_MODE environment setting", () => {
    process.env.AI_EXECUTION_MODE = "test";
    expect(getExecutionMode()).toBe("test");

    process.env.AI_EXECUTION_MODE = "live";
    expect(getExecutionMode()).toBe("live");
  });

  it("uses fallbackGenerator in demo or test mode", async () => {
    process.env.AI_EXECUTION_MODE = "demo";
    const schema = z.object({ summary: z.string() });

    const result = await executeLlmCall({
      userPrompt: "Summarize this topic",
      schema,
      fallbackGenerator: () => ({ summary: "Demo summary text" }),
    });

    expect(result.usedDemoAdapter).toBe(true);
    expect(result.provider).toBe("demo");
    expect(result.data.summary).toBe("Demo summary text");
    expect(result.usage.totalTokens).toBe(0);
  });

  it("throws clear configuration error in live mode when OPENAI_API_KEY is missing", async () => {
    process.env.AI_EXECUTION_MODE = "live";
    delete process.env.OPENAI_API_KEY;

    const schema = z.object({ answer: z.string() });

    await expect(
      executeLlmCall({
        userPrompt: "Test query",
        schema,
        fallbackGenerator: () => ({ answer: "fallback" }),
      }),
    ).rejects.toThrow("AI_EXECUTION_MODE is set to 'live' but OPENAI_API_KEY is not configured");
  });

  it("calls live OpenAI API and parses valid Zod output", async () => {
    process.env.AI_EXECUTION_MODE = "live";
    process.env.OPENAI_API_KEY = "test-api-key";

    const mockResponse = {
      choices: [{ message: { content: JSON.stringify({ result: "Live OpenAI Response" }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const schema = z.object({ result: z.string() });

    const response = await executeLlmCall({
      userPrompt: "Generate result",
      schema,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(response.usedDemoAdapter).toBe(false);
    expect(response.provider).toBe("openai");
    expect(response.data.result).toBe("Live OpenAI Response");
    expect(response.usage.promptTokens).toBe(100);
    expect(response.usage.completionTokens).toBe(50);
    expect(response.usage.totalTokens).toBe(150);
    expect(response.usage.estimatedCostCents).toBeGreaterThan(0);
  });
});
