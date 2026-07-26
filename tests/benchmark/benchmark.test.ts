import { describe, it, expect } from "vitest";
import { computeEvaluation } from "@/lib/evaluations/engine";
import { rankRecommendations } from "@/lib/recommendations/rank";
import { extractGraphElements } from "@/lib/knowledge-graph/extractor";
import { computeCacheHash } from "@/lib/ai/cache";

describe("Performance Benchmark Suite", () => {
  it("measures recommendation ranking latency (must execute under 50ms for 100 signals)", () => {
    const keywords = Array.from({ length: 50 }, (_, i) => ({
      keywordId: `kw-${i}`,
      term: `keyword term ${i}`,
      priorityScore: 0.5 + (i % 5) * 0.1,
    }));

    const start = performance.now();
    const ranked = rankRecommendations({
      keywords,
      gaps: [],
      content: [],
      visibility: [],
    });
    const durationMs = performance.now() - start;

    expect(ranked.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(50);
  });

  it("measures evaluation engine throughput (must evaluate under 20ms)", () => {
    const start = performance.now();
    const metrics = computeEvaluation({
      brandId: "11111111-1111-1111-1111-111111111111",
      bodyHtml: "<h1>Title</h1><h2>Subtitle</h2><p>This is a high quality test article paragraph.</p><p>Another paragraph.</p>",
      primaryKeyword: "test article",
    });
    const durationMs = performance.now() - start;

    expect(metrics.overallScore).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(20);
  });

  it("measures Knowledge Graph extraction throughput", () => {
    const text = "Our core product uses AI technology to compete with Primary Competitor in the platform market.";
    const start = performance.now();
    const { entities, relationships } = extractGraphElements(text);
    const durationMs = performance.now() - start;

    expect(entities.length).toBeGreaterThan(0);
    expect(relationships.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(10);
  });

  it("measures SHA256 semantic cache hashing speed", () => {
    const start = performance.now();
    const hash = computeCacheHash({
      brandId: "b1",
      stage: "writer",
      promptVersion: "v1.0.0",
      executionMode: "live",
      model: "gpt-4o",
      provider: "openai",
      requestPayload: { text: "sample text payload for hashing" },
    });
    const durationMs = performance.now() - start;

    expect(hash).toHaveLength(64);
    expect(durationMs).toBeLessThan(20);
  });
});
