/**
 * Recommendation ranking engine. Consumes normalized signals from
 * keywords, competitors (gap reports), content (articles), and AI
 * visibility, and produces a ranked list of recommendations, each with
 * title/reason/evidence/impact/confidence/action/status. Deterministic
 * and pure — no LLM call — so ranking order and score computation can be
 * asserted exactly against fixture inputs (see
 * tests/unit/recommendation-rank.test.ts).
 */

export type ImpactLevel = "low" | "medium" | "high";

export type KeywordSignal = {
  keywordId: string;
  term: string;
  priorityScore: number; // 0-1, from src/lib/scoring/priority.ts
};

export type GapSignal = {
  competitorId: string;
  competitorName: string;
  type: "content" | "schema" | "faq" | "backlink" | "ai_citation";
  priorityScore: number; // 0-1, from src/lib/competitors/gap-analysis.ts
  findingTitle: string;
};

export type ContentSignal = {
  articleId: string;
  title: string;
  status: string;
  seoScore: number | null; // 0-100
  eeatScore: number | null; // 0-100
  aiReadinessScore: number | null; // 0-100
};

export type VisibilitySignal = {
  promptId: string;
  promptText: string;
  platformDisplayName: string;
  mentioned: boolean;
  sentiment: string;
};

export type RecommendationSignals = {
  keywords: KeywordSignal[];
  gaps: GapSignal[];
  content: ContentSignal[];
  visibility: VisibilitySignal[];
};

export type RankedRecommendation = {
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  impact: ImpactLevel;
  confidence: number; // 0-1
  action: string;
  sourceSignal: "keyword" | "competitor" | "content" | "visibility";
  rankScore: number; // 0-1, used to sort; higher = more important
};

function impactFromScore(score: number): ImpactLevel {
  if (score >= 0.66) return "high";
  if (score >= 0.33) return "medium";
  return "low";
}

/**
 * rankScore weighting per source signal type. Each source contributes a
 * base score in [0, 1] (already normalized per-signal-type below), then
 * this weight scales its relative importance in the final ranked list.
 * Weights sum to 1 so a top-of-pool score from any single source type is
 * comparable in magnitude across types.
 */
const SOURCE_WEIGHTS = {
  keyword: 0.3,
  competitor: 0.3,
  content: 0.2,
  visibility: 0.2,
} as const;

function recommendationsFromKeywords(keywords: KeywordSignal[]): RankedRecommendation[] {
  // High-priority keywords with no content yet are the strongest signal
  // for "write about this" — priorityScore IS the base score here.
  return keywords
    .filter((k) => k.priorityScore >= 0.5)
    .map((k) => ({
      title: `Create content targeting "${k.term}"`,
      reason: `This keyword has a high priority score (${k.priorityScore.toFixed(2)}), indicating strong volume, low difficulty, or commercial intent.`,
      evidence: { keywordId: k.keywordId, term: k.term, priorityScore: k.priorityScore },
      impact: impactFromScore(k.priorityScore),
      confidence: 0.7,
      action: "Generate a content brief and run it through the content pipeline.",
      sourceSignal: "keyword" as const,
      rankScore: k.priorityScore * SOURCE_WEIGHTS.keyword,
    }));
}

function recommendationsFromGaps(gaps: GapSignal[]): RankedRecommendation[] {
  return gaps.map((g) => ({
    title: `Close ${g.type} gap vs. ${g.competitorName}`,
    reason: g.findingTitle,
    evidence: { competitorId: g.competitorId, type: g.type, priorityScore: g.priorityScore },
    impact: impactFromScore(g.priorityScore),
    confidence: 0.6, // demo-adapter-derived, so moderate confidence
    action: `Address the ${g.type} gap identified in the competitor radar.`,
    sourceSignal: "competitor" as const,
    rankScore: g.priorityScore * SOURCE_WEIGHTS.competitor,
  }));
}

function recommendationsFromContent(content: ContentSignal[]): RankedRecommendation[] {
  const recs: RankedRecommendation[] = [];
  for (const article of content) {
    if (article.status === "published") continue; // already live, lower priority to revisit
    const scores = [article.seoScore, article.eeatScore, article.aiReadinessScore].filter(
      (s): s is number => s !== null,
    );
    if (scores.length === 0) continue;
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    if (avgScore >= 80) continue; // already strong, no recommendation needed

    const gapScore = (100 - avgScore) / 100; // lower quality -> higher gapScore -> higher rank
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
      confidence: 0.8, // scores are deterministically computed, high confidence in the signal itself
      action: "Revise the article to address the lowest-scoring dimension.",
      sourceSignal: "content",
      rankScore: gapScore * SOURCE_WEIGHTS.content,
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
    if (gapRatio < 0.5) continue; // mentioned on most platforms already

    recs.push({
      title: `Improve AI visibility for "${snapshots[0].promptText}"`,
      reason: `Not mentioned on ${notMentionedCount} of ${snapshots.length} tracked platforms for this prompt.`,
      evidence: {
        promptText: snapshots[0].promptText,
        notMentionedCount,
        totalPlatforms: snapshots.length,
      },
      impact: impactFromScore(gapRatio),
      confidence: 0.5, // AI visibility signals are directional only — lower confidence
      action: "Publish authoritative content answering this prompt's underlying question.",
      sourceSignal: "visibility",
      rankScore: gapRatio * SOURCE_WEIGHTS.visibility,
    });
  }
  return recs;
}

/**
 * Ranks all recommendations across every signal source, highest
 * rankScore first. Stable sort (ties broken by original generation
 * order: keyword -> competitor -> content -> visibility) so the same
 * input always produces the same output order.
 */
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
      return a.index - b.index; // stable tie-break
    })
    .map(({ rec }) => rec);
}
