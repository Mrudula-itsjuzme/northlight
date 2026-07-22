import { describe, it, expect } from "vitest";
import { rankRecommendations, type RecommendationSignals } from "@/lib/recommendations/rank";

describe("rankRecommendations", () => {
  it("returns an empty array for empty signals", () => {
    expect(
      rankRecommendations({ keywords: [], gaps: [], content: [], visibility: [] }),
    ).toEqual([]);
  });

  it("ranks a fixture set in the expected order with exact rankScores (hand-computed)", () => {
    const signals: RecommendationSignals = {
      keywords: [{ keywordId: "kw1", term: "detangling brush", priorityScore: 0.8 }],
      gaps: [
        {
          competitorId: "c1",
          competitorName: "Rivalia",
          type: "content",
          priorityScore: 0.9,
          findingTitle: "Rivalia publishes buying guides you don't have.",
        },
      ],
      content: [
        {
          articleId: "a1",
          title: "Detangling 101",
          status: "draft",
          seoScore: 60,
          eeatScore: 60,
          aiReadinessScore: 60,
        },
      ],
      visibility: [
        { promptId: "p1", promptText: "best detangling brush", platformDisplayName: "ChatGPT", mentioned: false, sentiment: "unknown" },
        { promptId: "p1", promptText: "best detangling brush", platformDisplayName: "Claude", mentioned: false, sentiment: "unknown" },
        { promptId: "p1", promptText: "best detangling brush", platformDisplayName: "Gemini", mentioned: true, sentiment: "positive" },
      ],
    };

    const ranked = rankRecommendations(signals);

    expect(ranked).toHaveLength(4);

    // Hand-computed rankScores:
    // gap:        0.9 * 0.30 = 0.27   (highest)
    // keyword:    0.8 * 0.30 = 0.24
    // visibility: (2/3) * 0.20 = 0.1333...
    // content:    ((100-60)/100) * 0.20 = 0.08 (lowest)
    expect(ranked[0].sourceSignal).toBe("competitor");
    expect(ranked[0].rankScore).toBeCloseTo(0.27, 10);

    expect(ranked[1].sourceSignal).toBe("keyword");
    expect(ranked[1].rankScore).toBeCloseTo(0.24, 10);

    expect(ranked[2].sourceSignal).toBe("visibility");
    expect(ranked[2].rankScore).toBeCloseTo(2 / 3 * 0.2, 10);

    expect(ranked[3].sourceSignal).toBe("content");
    expect(ranked[3].rankScore).toBeCloseTo(0.08, 10);
  });

  it("is stable: identical input always produces identical output order", () => {
    const signals: RecommendationSignals = {
      keywords: [
        { keywordId: "kw1", term: "a", priorityScore: 0.6 },
        { keywordId: "kw2", term: "b", priorityScore: 0.6 },
      ],
      gaps: [],
      content: [],
      visibility: [],
    };

    const first = rankRecommendations(signals);
    const second = rankRecommendations(signals);
    expect(first).toEqual(second);
  });

  it("breaks exact rankScore ties by original generation order (keyword before gap before content before visibility)", () => {
    // Craft keyword and gap signals that produce the SAME rankScore.
    // keyword: priorityScore * 0.3; gap: priorityScore * 0.3.
    // Use priorityScore=0.5 for both => both rankScore = 0.15.
    const signals: RecommendationSignals = {
      keywords: [{ keywordId: "kw1", term: "tied keyword", priorityScore: 0.5 }],
      gaps: [
        {
          competitorId: "c1",
          competitorName: "Rivalia",
          type: "faq",
          priorityScore: 0.5,
          findingTitle: "tied gap",
        },
      ],
      content: [],
      visibility: [],
    };

    const ranked = rankRecommendations(signals);
    expect(ranked[0].rankScore).toBeCloseTo(ranked[1].rankScore, 10);
    // Keyword recommendations are generated before gap recommendations,
    // so on an exact tie the keyword one must come first.
    expect(ranked[0].sourceSignal).toBe("keyword");
    expect(ranked[1].sourceSignal).toBe("competitor");
  });

  it("excludes low-priority keywords (below the 0.5 threshold)", () => {
    const signals: RecommendationSignals = {
      keywords: [{ keywordId: "kw1", term: "low priority", priorityScore: 0.2 }],
      gaps: [],
      content: [],
      visibility: [],
    };
    expect(rankRecommendations(signals)).toHaveLength(0);
  });

  it("excludes published articles and already-strong articles from content recommendations", () => {
    const signals: RecommendationSignals = {
      keywords: [],
      gaps: [],
      content: [
        { articleId: "a1", title: "Published", status: "published", seoScore: 50, eeatScore: 50, aiReadinessScore: 50 },
        { articleId: "a2", title: "Already strong", status: "draft", seoScore: 90, eeatScore: 90, aiReadinessScore: 90 },
      ],
      visibility: [],
    };
    expect(rankRecommendations(signals)).toHaveLength(0);
  });

  it("excludes visibility gaps where the brand is mentioned on most platforms", () => {
    const signals: RecommendationSignals = {
      keywords: [],
      gaps: [],
      content: [],
      visibility: [
        { promptId: "p1", promptText: "x", platformDisplayName: "ChatGPT", mentioned: true, sentiment: "positive" },
        { promptId: "p1", promptText: "x", platformDisplayName: "Claude", mentioned: true, sentiment: "positive" },
        { promptId: "p1", promptText: "x", platformDisplayName: "Gemini", mentioned: false, sentiment: "unknown" },
      ],
    };
    expect(rankRecommendations(signals)).toHaveLength(0);
  });

  it("assigns impact levels consistent with score thresholds", () => {
    const signals: RecommendationSignals = {
      keywords: [
        { keywordId: "kw-high", term: "high", priorityScore: 0.9 },
        { keywordId: "kw-medium", term: "medium", priorityScore: 0.5 },
      ],
      gaps: [],
      content: [],
      visibility: [],
    };
    const ranked = rankRecommendations(signals);
    const high = ranked.find((r) => r.evidence.term === "high")!;
    const medium = ranked.find((r) => r.evidence.term === "medium")!;
    expect(high.impact).toBe("high");
    expect(medium.impact).toBe("medium");
  });

  it("every recommendation has all required fields populated", () => {
    const signals: RecommendationSignals = {
      keywords: [{ keywordId: "kw1", term: "test", priorityScore: 0.7 }],
      gaps: [],
      content: [],
      visibility: [],
    };
    const [rec] = rankRecommendations(signals);
    expect(rec.title).toBeTruthy();
    expect(rec.reason).toBeTruthy();
    expect(rec.evidence).toBeTruthy();
    expect(["low", "medium", "high"]).toContain(rec.impact);
    expect(rec.confidence).toBeGreaterThanOrEqual(0);
    expect(rec.confidence).toBeLessThanOrEqual(1);
    expect(rec.action).toBeTruthy();
    expect(rec.rankScore).toBeGreaterThanOrEqual(0);
  });
});
