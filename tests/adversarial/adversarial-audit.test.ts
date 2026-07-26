import { describe, it, expect } from "vitest";
import { computeEvaluation, countSyllables } from "@/lib/evaluations/engine";
import { computeCacheHash, canonicalizeJsonPayload, normalizeCacheStage } from "@/lib/ai/cache";
import { extractGraphElements, canonicalEntityKey, sanitizeEntityName } from "@/lib/knowledge-graph/extractor";
import { resolveModelRouting } from "@/lib/ai/cost-optimizer";
import { buildRankExplanation } from "@/lib/recommendations/continuous-learning";
import { rankRecommendations } from "@/lib/recommendations/rank";
import { computeBucketValue } from "@/lib/prompts/experimentation";
import { buildExecutionGraph, computeTopologicalLevels, type StageNodeConfig } from "@/lib/content/pipeline/dag";

describe("Adversarial Architecture Review — Comprehensive Failure Mode Audit", () => {
  describe("Subsystem 1: AI Evaluation Engine Failure Modes", () => {
    it("FM1.1: Empty or HTML-only content scores near zero (< 0.05)", () => {
      const metrics = computeEvaluation({
        brandId: "11111111-1111-1111-1111-111111111111",
        bodyHtml: "<div></div><p></p>",
        primaryKeyword: "test",
      });

      expect(metrics.overallScore).toBeLessThan(0.05);
      expect(metrics.readabilityScore).toBeLessThan(0.05);
      expect(metrics.explanation).toContain("empty or contains only HTML tags");
    });

    it("FM1.2: Handles regex special characters in primaryKeyword without SyntaxError / RegExp Injection", () => {
      expect(() => {
        computeEvaluation({
          brandId: "11111111-1111-1111-1111-111111111111",
          bodyHtml: "<p>We build C++ applications and (SEO) tools.</p>",
          primaryKeyword: "C++ (SEO) & [test]?",
        });
      }).not.toThrow();
    });

    it("FM1.3: Clamps all evaluation scores within strict [0, 1] bounds", () => {
      const metrics = computeEvaluation({
        brandId: "11111111-1111-1111-1111-111111111111",
        bodyHtml: "<h1>Title</h1><h2>Subtitle 1</h2><h2>Subtitle 2</h2><p>P1</p><p>P2</p><p>P3</p>",
        primaryKeyword: "test",
      });

      for (const [cat, score] of Object.entries(metrics.categoryScores)) {
        expect(score, `Category ${cat} out of bounds`).toBeGreaterThanOrEqual(0);
        expect(score, `Category ${cat} out of bounds`).toBeLessThanOrEqual(1);
      }
    });

    it("FM1.4: Accurately counts syllables for Flesch Reading Ease calculations", () => {
      expect(countSyllables("intelligence")).toBe(4);
      expect(countSyllables("code")).toBe(1);
      expect(countSyllables("optimization")).toBe(5);
    });
  });

  describe("Subsystem 2: AI Semantic Cache Revision & Stale Cache Prevention", () => {
    it("FM2.1: Generates deterministic hash regardless of JSON payload key insertion order", () => {
      const hash1 = computeCacheHash({
        brandId: "b1",
        stage: "writer",
        promptVersion: "v1.0.0",
        executionMode: "live",
        model: "gpt-4o",
        provider: "openai",
        requestPayload: { z: 1, a: 2, m: { b: 3, a: 4 } },
      });

      const hash2 = computeCacheHash({
        brandId: "b1",
        stage: "writer",
        promptVersion: "v1.0.0",
        executionMode: "live",
        model: "gpt-4o",
        provider: "openai",
        requestPayload: { a: 2, z: 1, m: { a: 4, b: 3 } },
      });

      expect(hash1).toBe(hash2);
    });

    it("FM2.2: Stale Cache Prevention — Changing Brand Brain or Knowledge Graph revision changes cache hash", () => {
      const baseLookup = {
        brandId: "b1",
        stage: "writer",
        promptVersion: "v1.0.0",
        brandBrainRevision: "bb_rev1",
        knowledgeGraphRevision: "kg_rev1",
        executionMode: "live",
        model: "gpt-4o",
        provider: "openai",
        requestPayload: { text: "sample text" },
      };

      const hashOriginal = computeCacheHash(baseLookup);
      const hashNewBrain = computeCacheHash({ ...baseLookup, brandBrainRevision: "bb_rev2" });
      const hashNewGraph = computeCacheHash({ ...baseLookup, knowledgeGraphRevision: "kg_rev2" });

      expect(hashOriginal).not.toBe(hashNewBrain);
      expect(hashOriginal).not.toBe(hashNewGraph);
    });
  });

  describe("Subsystem 3: Dynamic DAG Executor & Cycle Detection", () => {
    it("FM3.1: Detects DAG cycle and throws explicit error", () => {
      const cyclicNodes: Record<string, StageNodeConfig> = {
        stageA: { stage: "stageA" as any, dependencies: ["stageB" as any], canRunInParallel: false, maxRetries: 1, backoffMs: 100 },
        stageB: { stage: "stageB" as any, dependencies: ["stageA" as any], canRunInParallel: false, maxRetries: 1, backoffMs: 100 },
      };

      expect(() => computeTopologicalLevels(cyclicNodes)).toThrow(/DAG Cycle Detected/);
    });

    it("FM3.2: Detects missing dependencies and throws explicit error", () => {
      const invalidNodes: Record<string, StageNodeConfig> = {
        stageA: { stage: "stageA" as any, dependencies: ["missingStage" as any], canRunInParallel: false, maxRetries: 1, backoffMs: 100 },
      };

      expect(() => computeTopologicalLevels(invalidNodes)).toThrow(/depends on missing stage/);
    });

    it("FM3.3: Dynamically builds topological execution levels without code changes", () => {
      const graph = buildExecutionGraph();
      expect(graph.length).toBeGreaterThan(3);
      expect(graph[0]).toEqual(["research"]);
    });
  });

  describe("Subsystem 4: Prompt Experimentation Bucketing & Tenant Isolation", () => {
    it("FM4.1: Computes stable deterministic integer bucket scores (0-99)", () => {
      const bucket1 = computeBucketValue("brand-1:user-1:prompt-k1");
      const bucket2 = computeBucketValue("brand-1:user-1:prompt-k1");
      expect(bucket1).toBe(bucket2);
      expect(bucket1).toBeGreaterThanOrEqual(0);
      expect(bucket1).toBeLessThan(100);
    });

    it("FM4.2: Produces uniform distribution across large deterministic sample size", () => {
      const counts: Record<number, number> = {};
      for (let i = 0; i < 1000; i++) {
        const bucket = computeBucketValue(`test-brand:user-${i}:key-1`);
        const decile = Math.floor(bucket / 10);
        counts[decile] = (counts[decile] || 0) + 1;
      }

      // Every decile (0-9, 10-19, etc.) should receive a portion of traffic
      for (let d = 0; d < 10; d++) {
        expect(counts[d]).toBeGreaterThan(50);
      }
    });
  });

  describe("Subsystem 5: Knowledge Graph Integrity", () => {
    it("FM5.1: Generates canonical entity key for deduplication", () => {
      const key1 = canonicalEntityKey("brand1", "product", "  Core  Product  ");
      const key2 = canonicalEntityKey("brand1", "product", "core product");
      expect(key1).toBe("brand1:product:core_product");
      expect(key1).toBe(key2);
    });

    it("FM5.2: Filters out self-referential relationships (source === target)", () => {
      const { relationships } = extractGraphElements("Core Product is a Core Product.");
      for (const rel of relationships) {
        expect(rel.sourceEntityName).not.toBe(rel.targetEntityName);
      }
    });
  });

  describe("Subsystem 6: Cost Optimizer Multi-Factor Routing", () => {
    it("FM6.1: Safely falls back for unrecognized stage names", () => {
      const decision = resolveModelRouting("non_existent_stage");
      expect(decision.model).toBe("gpt-4o-mini");
      expect(decision.routingReason).toBeDefined();
    });

    it("FM6.2: Downgrades to cost-aware model when tenant budget is exceeded", () => {
      const decision = resolveModelRouting("writer", { tenantBudgetExceeded: true });
      expect(decision.model).toBe("gpt-4o-mini");
      expect(decision.routingReason).toContain("budget limit exceeded");
    });
  });
});
