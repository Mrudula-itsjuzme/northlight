import { describe, it, expect } from "vitest";
import {
  computeSeoScore,
  computeEeatScore,
  computeAiReadinessScore,
  computeArticleScores,
  type ArticleScoringInput,
} from "@/lib/content/scoring/article-scores";

const goodInput: ArticleScoringInput = {
  bodyHtml:
    "<h1>Detangling Brush Guide</h1><h2>Why detangling brush matters</h2><p>" +
    "word ".repeat(310) +
    "</p><h2>Frequently asked questions</h2><p>detangling brush is great</p>",
  metaTitle: "Detangling Brush Guide",
  metaDescription: "Everything about the detangling brush, explained simply.",
  primaryKeyword: "detangling brush",
  claimCount: 2,
  unresolvedClaimCount: 0,
  hasJsonLd: true,
};

describe("computeSeoScore", () => {
  it("scores a well-optimized article near 100", () => {
    expect(computeSeoScore(goodInput)).toBe(100);
  });

  it("loses points for a missing meta title", () => {
    const score = computeSeoScore({ ...goodInput, metaTitle: "" });
    expect(score).toBeLessThan(100);
  });

  it("loses points for an overly long meta title", () => {
    const score = computeSeoScore({ ...goodInput, metaTitle: "x".repeat(100) });
    expect(score).toBeLessThan(100);
  });

  it("loses points when the keyword never appears in the body", () => {
    const score = computeSeoScore({ ...goodInput, bodyHtml: "<h2>Nothing relevant</h2>" });
    expect(score).toBeLessThan(100);
  });

  it("stays within [0, 100]", () => {
    const score = computeSeoScore({
      ...goodInput,
      metaTitle: "",
      metaDescription: "",
      bodyHtml: "",
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("computeEeatScore", () => {
  it("scores a long, well-fact-checked article near 100", () => {
    expect(computeEeatScore(goodInput)).toBe(100);
  });

  it("loses points for short body content", () => {
    const score = computeEeatScore({ ...goodInput, bodyHtml: "<p>short</p>" });
    expect(score).toBeLessThan(100);
  });

  it("loses points when there are unresolved claims", () => {
    const score = computeEeatScore({ ...goodInput, unresolvedClaimCount: 2 });
    expect(score).toBeLessThan(100);
  });
});

describe("computeAiReadinessScore", () => {
  it("scores a well-structured article with JSON-LD near 100", () => {
    expect(computeAiReadinessScore(goodInput)).toBe(100);
  });

  it("loses points when there's no JSON-LD", () => {
    const score = computeAiReadinessScore({ ...goodInput, hasJsonLd: false });
    expect(score).toBeLessThan(100);
  });

  it("loses points with fewer than 2 headings", () => {
    const score = computeAiReadinessScore({
      ...goodInput,
      bodyHtml: "<p>no headings here at all</p>",
    });
    expect(score).toBeLessThan(100);
  });
});

describe("computeArticleScores", () => {
  it("returns all three scores together", () => {
    const scores = computeArticleScores(goodInput);
    expect(scores.seoScore).toBeGreaterThan(0);
    expect(scores.eeatScore).toBeGreaterThan(0);
    expect(scores.aiReadinessScore).toBeGreaterThan(0);
  });
});
