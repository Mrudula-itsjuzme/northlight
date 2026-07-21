/**
 * Keyword priority scoring, per the plan's exact formula:
 *
 *   priority = 0.30 * normalizedVolume
 *            + 0.25 * (1 - normalizedDifficulty)
 *            + 0.20 * commercialIntent
 *            + 0.15 * trend
 *            + 0.10 * businessValue
 *
 * `normalizedVolume` and `normalizedDifficulty` are min-max normalized
 * against the brand's own keyword set (so a brand with only
 * low-competition keywords doesn't have every keyword score near zero
 * just because none of them have huge absolute volume). `commercialIntent`,
 * `trend`, and `businessValue` arrive already normalized to [0, 1] — they
 * are qualitative/derived signals, not raw counts, so no min-max
 * normalization is applied to them.
 */

export const PRIORITY_WEIGHTS = {
  volume: 0.3,
  difficulty: 0.25,
  commercialIntent: 0.2,
  trend: 0.15,
  businessValue: 0.1,
} as const;

export type RawKeywordMetrics = {
  rawVolume: number;
  rawDifficulty: number;
  commercialIntent: number; // already 0-1
  trend: number; // already 0-1
  businessValue: number; // already 0-1
};

export type NormalizedKeywordMetrics = {
  normalizedVolume: number;
  normalizedDifficulty: number;
  commercialIntent: number;
  trend: number;
  businessValue: number;
  priorityScore: number;
};

/**
 * Min-max normalizes `value` into [0, 1] given the min/max of the full set
 * it belongs to. If every value in the set is identical (min === max),
 * returns 0.5 — a neutral midpoint — rather than dividing by zero.
 */
export function minMaxNormalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

/**
 * Computes the priority score for one keyword, given its raw metrics and
 * the min/max volume & difficulty across the brand's full keyword set
 * (the normalization baseline). Returns both the normalized inputs and
 * the final score so callers can persist the full audit trail (this is
 * exactly what `keywords`/`keyword_scores` store — see DATABASE.md).
 */
export function computePriorityScore(
  metrics: RawKeywordMetrics,
  volumeRange: { min: number; max: number },
  difficultyRange: { min: number; max: number },
): NormalizedKeywordMetrics {
  const normalizedVolume = minMaxNormalize(metrics.rawVolume, volumeRange.min, volumeRange.max);
  const normalizedDifficulty = minMaxNormalize(
    metrics.rawDifficulty,
    difficultyRange.min,
    difficultyRange.max,
  );

  const priorityScore =
    PRIORITY_WEIGHTS.volume * normalizedVolume +
    PRIORITY_WEIGHTS.difficulty * (1 - normalizedDifficulty) +
    PRIORITY_WEIGHTS.commercialIntent * metrics.commercialIntent +
    PRIORITY_WEIGHTS.trend * metrics.trend +
    PRIORITY_WEIGHTS.businessValue * metrics.businessValue;

  return {
    normalizedVolume,
    normalizedDifficulty,
    commercialIntent: metrics.commercialIntent,
    trend: metrics.trend,
    businessValue: metrics.businessValue,
    priorityScore,
  };
}

/**
 * Scores an entire brand's keyword set in one pass: computes the min/max
 * volume & difficulty baseline from the set itself, then scores every
 * keyword against that shared baseline. This is what a re-score run
 * does — every keyword's normalized values (and therefore its priority
 * score) can shift when the set changes, which is exactly why
 * `keyword_scores` is an append-only history rather than an overwrite.
 */
export function scoreKeywordSet<T extends RawKeywordMetrics>(
  keywords: T[],
): Array<T & NormalizedKeywordMetrics> {
  if (keywords.length === 0) return [];

  const volumes = keywords.map((k) => k.rawVolume);
  const difficulties = keywords.map((k) => k.rawDifficulty);

  const volumeRange = { min: Math.min(...volumes), max: Math.max(...volumes) };
  const difficultyRange = { min: Math.min(...difficulties), max: Math.max(...difficulties) };

  return keywords.map((keyword) => ({
    ...keyword,
    ...computePriorityScore(keyword, volumeRange, difficultyRange),
  }));
}
