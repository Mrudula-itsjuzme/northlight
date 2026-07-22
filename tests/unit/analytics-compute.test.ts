import { describe, it, expect } from "vitest";
import {
  articleStatusBreakdown,
  articlesGeneratedCount,
  articlesPublishedCount,
  contentVelocityByWeek,
  medianTimeToFirstPublishHours,
  estimatedAiCostUsd,
  totalTokensUsed,
  visibilityTrendByWeek,
  keywordCoverageRatio,
  averagePriorityScore,
  completedRecommendationsCount,
  centsToUsd,
  type ArticleRow,
  type PipelineRunRow,
  type VisibilitySnapshotRow,
} from "@/lib/analytics/compute";

function article(overrides: Partial<ArticleRow>): ArticleRow {
  return {
    id: "a1",
    status: "draft",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    publishedAt: null,
    seoScore: null,
    eeatScore: null,
    aiReadinessScore: null,
    ...overrides,
  };
}

describe("centsToUsd", () => {
  it("converts cents to dollars, rounding to whole cents", () => {
    expect(centsToUsd(1234)).toBe(12.34);
    expect(centsToUsd(0)).toBe(0);
    expect(centsToUsd(1234.6)).toBe(12.35); // rounds the cent value itself
  });
});

describe("articleStatusBreakdown", () => {
  it("counts every status key, including zero counts", () => {
    const articles = [
      article({ status: "draft" }),
      article({ status: "draft" }),
      article({ status: "published" }),
    ];
    expect(articleStatusBreakdown(articles)).toEqual({
      draft: 2,
      review: 0,
      approved: 0,
      published: 1,
    });
  });

  it("returns all-zero breakdown for an empty set", () => {
    expect(articleStatusBreakdown([])).toEqual({
      draft: 0,
      review: 0,
      approved: 0,
      published: 0,
    });
  });
});

describe("articlesGeneratedCount / articlesPublishedCount", () => {
  it("counts total and published articles separately", () => {
    const articles = [
      article({ status: "draft" }),
      article({ status: "published" }),
      article({ status: "published" }),
    ];
    expect(articlesGeneratedCount(articles)).toBe(3);
    expect(articlesPublishedCount(articles)).toBe(2);
  });
});

describe("contentVelocityByWeek", () => {
  it("buckets published articles by ISO week, ignoring non-published", () => {
    const articles = [
      article({ status: "published", publishedAt: new Date("2026-01-05T00:00:00Z") }), // W01 2026
      article({ status: "published", publishedAt: new Date("2026-01-06T00:00:00Z") }), // W02 2026
      article({ status: "draft" }), // excluded
    ];
    const velocity = contentVelocityByWeek(articles);
    expect(velocity.map((v) => v.count).reduce((a, b) => a + b, 0)).toBe(2);
    // Sorted chronologically
    for (let i = 1; i < velocity.length; i++) {
      expect(velocity[i].week >= velocity[i - 1].week).toBe(true);
    }
  });

  it("returns an empty array when nothing is published", () => {
    expect(contentVelocityByWeek([article({ status: "draft" })])).toEqual([]);
  });
});

describe("medianTimeToFirstPublishHours", () => {
  it("returns null when nothing has been published", () => {
    expect(medianTimeToFirstPublishHours([article({ status: "draft" })])).toBeNull();
  });

  it("computes the median of exact hour deltas for an odd count", () => {
    const articles = [
      article({
        status: "published",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        publishedAt: new Date("2026-01-01T02:00:00Z"), // 2h
      }),
      article({
        status: "published",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        publishedAt: new Date("2026-01-01T10:00:00Z"), // 10h
      }),
      article({
        status: "published",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        publishedAt: new Date("2026-01-01T06:00:00Z"), // 6h
      }),
    ];
    // sorted: [2, 6, 10] -> median 6
    expect(medianTimeToFirstPublishHours(articles)).toBe(6);
  });

  it("computes the average of the two middle values for an even count", () => {
    const articles = [
      article({
        status: "published",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        publishedAt: new Date("2026-01-01T02:00:00Z"), // 2h
      }),
      article({
        status: "published",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        publishedAt: new Date("2026-01-01T04:00:00Z"), // 4h
      }),
    ];
    // [2, 4] -> (2+4)/2 = 3
    expect(medianTimeToFirstPublishHours(articles)).toBe(3);
  });
});

describe("estimatedAiCostUsd / totalTokensUsed", () => {
  function run(overrides: Partial<PipelineRunRow>): PipelineRunRow {
    return {
      id: "r1",
      status: "completed",
      totalCostCents: 0,
      totalTokens: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("sums cost across all runs and converts to USD", () => {
    const runs = [run({ totalCostCents: 150 }), run({ totalCostCents: 250 })];
    expect(estimatedAiCostUsd(runs)).toBe(4.0);
  });

  it("sums tokens across all runs", () => {
    const runs = [run({ totalTokens: 1000 }), run({ totalTokens: 2500 })];
    expect(totalTokensUsed(runs)).toBe(3500);
  });

  it("returns 0 for an empty run set", () => {
    expect(estimatedAiCostUsd([])).toBe(0);
    expect(totalTokensUsed([])).toBe(0);
  });
});

describe("visibilityTrendByWeek", () => {
  function snap(overrides: Partial<VisibilitySnapshotRow>): VisibilitySnapshotRow {
    return { platformKey: "chatgpt", mentioned: false, createdAt: new Date("2026-01-05T00:00:00Z"), ...overrides };
  }

  it("computes exact mention rate per platform per week", () => {
    const snapshots = [
      snap({ platformKey: "chatgpt", mentioned: true }),
      snap({ platformKey: "chatgpt", mentioned: false }),
      snap({ platformKey: "chatgpt", mentioned: true }),
      snap({ platformKey: "chatgpt", mentioned: true }),
    ];
    const trend = visibilityTrendByWeek(snapshots);
    expect(trend).toHaveLength(1);
    expect(trend[0].platformKey).toBe("chatgpt");
    expect(trend[0].sampleSize).toBe(4);
    expect(trend[0].mentionRate).toBeCloseTo(0.75, 10);
  });

  it("keeps different platforms in the same week as separate buckets", () => {
    const snapshots = [
      snap({ platformKey: "chatgpt", mentioned: true }),
      snap({ platformKey: "claude", mentioned: false }),
    ];
    const trend = visibilityTrendByWeek(snapshots);
    expect(trend).toHaveLength(2);
  });

  it("returns an empty array for no snapshots", () => {
    expect(visibilityTrendByWeek([])).toEqual([]);
  });
});

describe("keywordCoverageRatio", () => {
  it("computes exact covered/total/ratio", () => {
    const result = keywordCoverageRatio([
      { id: "k1", hasContent: true },
      { id: "k2", hasContent: false },
      { id: "k3", hasContent: true },
      { id: "k4", hasContent: false },
    ]);
    expect(result).toEqual({ covered: 2, total: 4, ratio: 0.5 });
  });

  it("returns ratio 0 for an empty keyword set (no division by zero)", () => {
    expect(keywordCoverageRatio([])).toEqual({ covered: 0, total: 0, ratio: 0 });
  });
});

describe("averagePriorityScore", () => {
  it("averages only non-null scores", () => {
    const avg = averagePriorityScore([
      { id: "k1", priorityScore: 0.4 },
      { id: "k2", priorityScore: null },
      { id: "k3", priorityScore: 0.8 },
    ]);
    expect(avg).toBeCloseTo(0.6, 10);
  });

  it("returns null when no keyword has a computed score", () => {
    expect(averagePriorityScore([{ id: "k1", priorityScore: null }])).toBeNull();
  });
});

describe("completedRecommendationsCount", () => {
  it("counts done vs total", () => {
    const result = completedRecommendationsCount([
      { id: "r1", status: "done" },
      { id: "r2", status: "new" },
      { id: "r3", status: "done" },
      { id: "r4", status: "dismissed" },
    ]);
    expect(result).toEqual({ done: 2, total: 4 });
  });
});
