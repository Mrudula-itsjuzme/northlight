/**
 * Recommendation ranking engine. Consumes normalized signals from
 * keywords, competitors (gap reports), content (articles), and AI
 * visibility, and produces a ranked list of recommendations, each with
 * title/reason/evidence/impact/confidence/action/status/scoreBreakdown.
 * Deterministic and pure.
 */

export type ImpactLevel = "low" | "medium" | "high";

export type KeywordSignal = {
  keywordId: string;
  term: string;
  priorityScore: number; // 0-1, from src/lib/scoring/priority.ts
  createdAt?: Date;
};

export type GapSignal = {
  competitorId: string;
  competitorName: string;
  type: "content" | "schema" | "faq" | "backlink" | "ai_citation";
  priorityScore: number; // 0-1, from src/lib/competitors/gap-analysis.ts
  findingTitle: string;
  createdAt?: Date;
};

export type ContentSignal = {
  articleId: string;
  title: string;
  status: string;
  seoScore: number | null; // 0-100
  eeatScore: number | null; // 0-100
  aiReadinessScore: number | null; // 0-100
  createdAt?: Date;
};

export type VisibilitySignal = {
  promptId: string;
  promptText: string;
  platformDisplayName: string;
  mentioned: boolean;
  sentiment: string;
  createdAt?: Date;
};

export type RecommendationSignals = {
  keywords: KeywordSignal[];
  gaps: GapSignal[];
  content: ContentSignal[];
  visibility: VisibilitySignal[];
};

export type RecommendationScoreBreakdown = {
  baseScore: number;
  businessValue: number;
  freshnessFactor: number;
  confidence: number;
  weightedScore: number;
  signalContributions: Record<string, number>;
};

export type RankedRecommendation = {
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  impact: ImpactLevel;
  confidence: number; // 0-1
  action: string;
  estimatedEffort: "low" | "medium" | "high";
  sourceSignal: "keyword" | "competitor" | "content" | "visibility";
  rankScore: number; // 0-1, used to sort; higher = more important
  scoreBreakdown: RecommendationScoreBreakdown;
};

function impactFromScore(score: number): ImpactLevel {
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "medium";
  return "low";
}

/**
 * Calculates a decay factor [0, 1] based on signal age in days.
 * Signal created today has factor 1.0; 30-day old signal decays towards ~0.5.
 */
function calculateFreshnessFactor(createdAt?: Date): number {
  if (!createdAt) return 1.0;
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays <= 0) return 1.0;
  return Math.max(0.2, Math.exp(-0.02 * ageInDays));
}

const SOURCE_WEIGHTS = {
  keyword: 0.3,
  competitor: 0.3,
  content: 0.2,
  visibility: 0.2,
} as const;

function recommendationsFromKeywords(keywords: KeywordSignal[]): RankedRecommendation[] {
  return keywords
    .filter((k) => k.priorityScore >= 0.5)
    .map((k) => {
      const freshnessFactor = calculateFreshnessFactor(k.createdAt);
      const confidence = 0.7;
      const baseScore = k.priorityScore;
      const rankScore = baseScore * SOURCE_WEIGHTS.keyword;

      return {
        title: `Create content targeting "${k.term}"`,
        reason: `This keyword has a high priority score (${k.priorityScore.toFixed(2)}), indicating strong volume, low difficulty, or commercial intent.`,
        evidence: { keywordId: k.keywordId, term: k.term, priorityScore: k.priorityScore },
        impact: impactFromScore(k.priorityScore),
        confidence,
        action: "Generate a content brief and run it through the content pipeline.",
        estimatedEffort: "medium",
        sourceSignal: "keyword" as const,
        rankScore,
        scoreBreakdown: {
          baseScore,
          businessValue: k.priorityScore,
          freshnessFactor,
          confidence,
          weightedScore: rankScore,
          signalContributions: {
            keywordPriority: rankScore,
            freshness: freshnessFactor,
            businessValue: k.priorityScore,
          },
        },
      };
    });
}

function recommendationsFromGaps(gaps: GapSignal[]): RankedRecommendation[] {
  return gaps.map((g) => {
    const freshnessFactor = calculateFreshnessFactor(g.createdAt);
    const confidence = 0.6;
    const baseScore = g.priorityScore;
    const rankScore = baseScore * SOURCE_WEIGHTS.competitor;
    const estimatedEffort = g.type === "schema" || g.type === "faq" ? "low" : "high";

    return {
      title: `Close ${g.type} gap vs. ${g.competitorName}`,
      reason: g.findingTitle,
      evidence: { competitorId: g.competitorId, type: g.type, priorityScore: g.priorityScore },
      impact: impactFromScore(g.priorityScore),
      confidence,
      action: `Address the ${g.type} gap identified in the competitor radar.`,
      estimatedEffort,
      sourceSignal: "competitor" as const,
      rankScore,
      scoreBreakdown: {
        baseScore,
        businessValue: g.priorityScore,
        freshnessFactor,
        confidence,
        weightedScore: rankScore,
        signalContributions: {
          competitorGap: rankScore,
          freshness: freshnessFactor,
          businessValue: g.priorityScore,
        },
      },
    };
  });
}

function recommendationsFromContent(content: ContentSignal[]): RankedRecommendation[] {
  const recs: RankedRecommendation[] = [];
  for (const article of content) {
    if (article.status === "published") continue;
    const scores = [article.seoScore, article.eeatScore, article.aiReadinessScore].filter(
      (s): s is number => s !== null,
    );
    if (scores.length === 0) continue;
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    if (avgScore >= 80) continue;

    const gapScore = (100 - avgScore) / 100;
    const freshnessFactor = calculateFreshnessFactor(article.createdAt);
    const confidence = 0.8;
    const rankScore = gapScore * SOURCE_WEIGHTS.content;

    recs.push({
      title: `Improve "${article.title}" before publishing`,
      reason: `Average SEO/EEAT/AI-readiness score is ${avgScore.toFixed(0)}/100, below the 80 threshold.`,
      evidence: {
        articleId: article.articleId,
        seoScore: article.seoScore,
        eeatScore: article.eeatScore,
        aiReadinessScore: article.aiReadinessScore,
      },
      impact: impactFromScore(gapScore),
      confidence,
      action: "Revise the article to address the lowest-scoring dimension.",
      estimatedEffort: "low",
      sourceSignal: "content",
      rankScore,
      scoreBreakdown: {
        baseScore: gapScore,
        businessValue: gapScore,
        freshnessFactor,
        confidence,
        weightedScore: rankScore,
        signalContributions: {
          contentQualityGap: rankScore,
          freshness: freshnessFactor,
          businessValue: gapScore,
        },
      },
    });
  }
  return recs;
}

function recommendationsFromVisibility(visibility: VisibilitySignal[]): RankedRecommendation[] {
  const recs: RankedRecommendation[] = [];
  const byPrompt = new Map<string, VisibilitySignal[]>();
  for (const v of visibility) {
    const list = byPrompt.get(v.promptId) ?? [];
    list.push(v);
    byPrompt.set(v.promptId, list);
  }

  for (const [, snapshots] of Array.from(byPrompt.entries())) {
    const notMentionedCount = snapshots.filter((s) => !s.mentioned).length;
    const gapRatio = notMentionedCount / snapshots.length;
    if (gapRatio < 0.5) continue;

    const freshnessFactor = calculateFreshnessFactor(snapshots[0].createdAt);
    const confidence = 0.5;
    const rankScore = gapRatio * SOURCE_WEIGHTS.visibility;

    recs.push({
      title: `Improve AI visibility for "${snapshots[0].promptText}"`,
      reason: `Not mentioned on ${notMentionedCount} of ${snapshots.length} tracked platforms for this prompt.`,
      evidence: {
        promptText: snapshots[0].promptText,
        notMentionedCount,
        totalPlatforms: snapshots.length,
      },
      impact: impactFromScore(gapRatio),
      confidence,
      action: "Publish authoritative content answering this prompt's underlying question.",
      estimatedEffort: "high",
      sourceSignal: "visibility",
      rankScore,
      scoreBreakdown: {
        baseScore: gapRatio,
        businessValue: gapRatio,
        freshnessFactor,
        confidence,
        weightedScore: rankScore,
        signalContributions: {
          visibilityGap: rankScore,
          freshness: freshnessFactor,
          businessValue: gapRatio,
        },
      },
    });
  }
  return recs;
}

export function rankRecommendations(signals: RecommendationSignals): RankedRecommendation[] {
  const all = [
    ...recommendationsFromKeywords(signals.keywords),
    ...recommendationsFromGaps(signals.gaps),
    ...recommendationsFromContent(signals.content),
    ...recommendationsFromVisibility(signals.visibility),
  ];

  return all
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => {
      if (b.rec.rankScore !== a.rec.rankScore) return b.rec.rankScore - a.rec.rankScore;
      return a.index - b.index;
    })
    .map(({ rec }) => rec);
}
