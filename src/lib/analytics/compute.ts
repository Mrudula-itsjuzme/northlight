/**
 * Pure aggregation functions for the Analytics dashboard (Phase 11).
 * Kept separate from queries.ts (which fetches rows via Drizzle) so the
 * math itself — content velocity, time-to-first-publish, estimated AI
 * cost, keyword coverage, visibility trend buckets — can be unit tested
 * against fixture rows without a database.
 */

export type ArticleRow = {
  id: string;
  status: "draft" | "review" | "approved" | "published";
  createdAt: Date;
  publishedAt: Date | null;
  seoScore: number | null;
  eeatScore: number | null;
  aiReadinessScore: number | null;
};

export type PipelineRunRow = {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "retrying";
  totalCostCents: number;
  totalTokens: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VisibilitySnapshotRow = {
  platformKey: string;
  mentioned: boolean;
  createdAt: Date;
};

export type KeywordRow = {
  id: string;
  priorityScore: number | null;
};

export type RecommendationRow = {
  id: string;
  status: "new" | "in_progress" | "done" | "dismissed";
};

/** Published-per-week USD estimate, so cost trends read in a familiar unit. */
export function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/** Counts of articles by lifecycle status, always including every status key (0 if absent). */
export function articleStatusBreakdown(
  articles: ArticleRow[],
): Record<ArticleRow["status"], number> {
  const breakdown: Record<ArticleRow["status"], number> = {
    draft: 0,
    review: 0,
    approved: 0,
    published: 0,
  };
  for (const a of articles) {
    breakdown[a.status]++;
  }
  return breakdown;
}

export function articlesGeneratedCount(articles: ArticleRow[]): number {
  return articles.length;
}

export function articlesPublishedCount(articles: ArticleRow[]): number {
  return articles.filter((a) => a.status === "published").length;
}

/**
 * Content velocity: published articles per ISO week (YYYY-Www), sorted
 * chronologically. Weeks with zero publishes in the observed range are
 * NOT synthesized here — the caller fills gaps if a fixed axis is needed
 * for charting (keeps this function a pure grouping of what happened).
 */
export function contentVelocityByWeek(
  articles: ArticleRow[],
): Array<{ week: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const a of articles) {
    if (a.status !== "published" || !a.publishedAt) continue;
    const week = isoWeekKey(a.publishedAt);
    buckets.set(week, (buckets.get(week) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, count]) => ({ week, count }));
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Median time (in hours) from an article's creation to its first
 * publish, across all articles that HAVE been published. Returns null
 * if no article has been published yet (nothing to measure).
 */
export function medianTimeToFirstPublishHours(articles: ArticleRow[]): number | null {
  const durations = articles
    .filter((a) => a.status === "published" && a.publishedAt)
    .map((a) => (a.publishedAt!.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60))
    .filter((h) => h >= 0)
    .sort((a, b) => a - b);

  if (durations.length === 0) return null;
  const mid = Math.floor(durations.length / 2);
  if (durations.length % 2 === 0) {
    return (durations[mid - 1] + durations[mid]) / 2;
  }
  return durations[mid];
}

/**
 * Estimated AI cost: sums totalCostCents already tracked per pipeline run
 * (Phase 7's runner records real per-stage cost/token counts against a
 * documented per-1k-token price — see AI_SCORING.md /
 * src/lib/content/pipeline/runner.ts). Labeled "estimated" (never
 * "live"/billed) because it's derived from a published price assumption,
 * not a real payment-provider invoice.
 */
export function estimatedAiCostUsd(runs: PipelineRunRow[]): number {
  const totalCents = runs.reduce((sum, r) => sum + r.totalCostCents, 0);
  return centsToUsd(totalCents);
}

export function totalTokensUsed(runs: PipelineRunRow[]): number {
  return runs.reduce((sum, r) => sum + r.totalTokens, 0);
}

/**
 * Visibility trend: mention rate (0-1) per platform per ISO week,
 * across all snapshots. Used to chart whether AI visibility is
 * improving over time. Directional only — never described as an
 * official citation count.
 */
export function visibilityTrendByWeek(
  snapshots: VisibilitySnapshotRow[],
): Array<{ week: string; platformKey: string; mentionRate: number; sampleSize: number }> {
  const buckets = new Map<string, { mentioned: number; total: number }>();
  for (const s of snapshots) {
    const week = isoWeekKey(s.createdAt);
    const key = `${week}::${s.platformKey}`;
    const entry = buckets.get(key) ?? { mentioned: 0, total: 0 };
    entry.total++;
    if (s.mentioned) entry.mentioned++;
    buckets.set(key, entry);
  }
  return Array.from(buckets.entries())
    .map(([key, { mentioned, total }]) => {
      const [week, platformKey] = key.split("::");
      return { week, platformKey, mentionRate: mentioned / total, sampleSize: total };
    })
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
}

/**
 * Keyword coverage: fraction of a brand's keywords that have an
 * associated article. Since keywords don't carry a direct article_id
 * FK, coverage is approximated by term-overlap with content brief
 * titles/keyword_id linkage upstream (the caller passes the already-
 * joined "hasContent" flag per keyword — this function just aggregates).
 */
export function keywordCoverageRatio(
  keywords: Array<{ id: string; hasContent: boolean }>,
): { covered: number; total: number; ratio: number } {
  const total = keywords.length;
  const covered = keywords.filter((k) => k.hasContent).length;
  return { covered, total, ratio: total === 0 ? 0 : covered / total };
}

export function averagePriorityScore(keywords: KeywordRow[]): number | null {
  const scored = keywords.filter((k): k is KeywordRow & { priorityScore: number } => k.priorityScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((sum, k) => sum + k.priorityScore, 0) / scored.length;
}

export function completedRecommendationsCount(recs: RecommendationRow[]): {
  done: number;
  total: number;
} {
  return { done: recs.filter((r) => r.status === "done").length, total: recs.length };
}
