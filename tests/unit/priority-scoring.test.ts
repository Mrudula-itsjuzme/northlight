import { describe, it, expect } from "vitest";
import {
  computePriorityScore,
  minMaxNormalize,
  scoreKeywordSet,
  PRIORITY_WEIGHTS,
  type RawKeywordMetrics,
} from "@/lib/scoring/priority";

describe("PRIORITY_WEIGHTS", () => {
  it("matches the exact weights specified in the plan and sums to 1", () => {
    expect(PRIORITY_WEIGHTS.volume).toBe(0.3);
    expect(PRIORITY_WEIGHTS.difficulty).toBe(0.25);
    expect(PRIORITY_WEIGHTS.commercialIntent).toBe(0.2);
    expect(PRIORITY_WEIGHTS.trend).toBe(0.15);
    expect(PRIORITY_WEIGHTS.businessValue).toBe(0.1);

    const sum =
      PRIORITY_WEIGHTS.volume +
      PRIORITY_WEIGHTS.difficulty +
      PRIORITY_WEIGHTS.commercialIntent +
      PRIORITY_WEIGHTS.trend +
      PRIORITY_WEIGHTS.businessValue;
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("minMaxNormalize", () => {
  it("normalizes a value proportionally within the range", () => {
    expect(minMaxNormalize(50, 0, 100)).toBe(0.5);
    expect(minMaxNormalize(0, 0, 100)).toBe(0);
    expect(minMaxNormalize(100, 0, 100)).toBe(1);
    expect(minMaxNormalize(25, 0, 100)).toBe(0.25);
  });

  it("returns 0.5 when min === max (no variance in the set)", () => {
    expect(minMaxNormalize(42, 42, 42)).toBe(0.5);
  });
});

describe("computePriorityScore — exact fixture (worked by hand)", () => {
  // Fixture: three keywords with hand-computed expected outputs.
  // Volume range: [1000, 5000]; difficulty range: [20, 60].
  const keywordA: RawKeywordMetrics = {
    rawVolume: 1000,
    rawDifficulty: 20,
    commercialIntent: 0.8,
    trend: 0.5,
    businessValue: 0.9,
  };
  const keywordB: RawKeywordMetrics = {
    rawVolume: 5000,
    rawDifficulty: 60,
    commercialIntent: 0.3,
    trend: 0.2,
    businessValue: 0.4,
  };
  const keywordC: RawKeywordMetrics = {
    rawVolume: 3000,
    rawDifficulty: 40,
    commercialIntent: 0.6,
    trend: 0.7,
    businessValue: 0.6,
  };

  const volumeRange = { min: 1000, max: 5000 };
  const difficultyRange = { min: 20, max: 60 };

  it("keyword A (min volume, min difficulty): normalizedVolume=0, normalizedDifficulty=0", () => {
    const result = computePriorityScore(keywordA, volumeRange, difficultyRange);
    expect(result.normalizedVolume).toBeCloseTo(0, 10);
    expect(result.normalizedDifficulty).toBeCloseTo(0, 10);
    // 0.30*0 + 0.25*(1-0) + 0.20*0.8 + 0.15*0.5 + 0.10*0.9
    // = 0 + 0.25 + 0.16 + 0.075 + 0.09 = 0.575
    expect(result.priorityScore).toBeCloseTo(0.575, 10);
  });

  it("keyword B (max volume, max difficulty): normalizedVolume=1, normalizedDifficulty=1", () => {
    const result = computePriorityScore(keywordB, volumeRange, difficultyRange);
    expect(result.normalizedVolume).toBeCloseTo(1, 10);
    expect(result.normalizedDifficulty).toBeCloseTo(1, 10);
    // 0.30*1 + 0.25*(1-1) + 0.20*0.3 + 0.15*0.2 + 0.10*0.4
    // = 0.30 + 0 + 0.06 + 0.03 + 0.04 = 0.43
    expect(result.priorityScore).toBeCloseTo(0.43, 10);
  });

  it("keyword C (midpoint volume, midpoint difficulty): normalizedVolume=0.5, normalizedDifficulty=0.5", () => {
    const result = computePriorityScore(keywordC, volumeRange, difficultyRange);
    expect(result.normalizedVolume).toBeCloseTo(0.5, 10);
    expect(result.normalizedDifficulty).toBeCloseTo(0.5, 10);
    // 0.30*0.5 + 0.25*(1-0.5) + 0.20*0.6 + 0.15*0.7 + 0.10*0.6
    // = 0.15 + 0.125 + 0.12 + 0.105 + 0.06 = 0.56
    expect(result.priorityScore).toBeCloseTo(0.56, 10);
  });

  it("higher difficulty strictly lowers the score, holding everything else equal", () => {
    const low = computePriorityScore(
      { ...keywordA, rawDifficulty: 20 },
      volumeRange,
      difficultyRange,
    );
    const high = computePriorityScore(
      { ...keywordA, rawDifficulty: 60 },
      volumeRange,
      difficultyRange,
    );
    expect(high.priorityScore).toBeLessThan(low.priorityScore);
  });

  it("higher volume strictly raises the score, holding everything else equal", () => {
    const low = computePriorityScore(
      { ...keywordA, rawVolume: 1000 },
      volumeRange,
      difficultyRange,
    );
    const high = computePriorityScore(
      { ...keywordA, rawVolume: 5000 },
      volumeRange,
      difficultyRange,
    );
    expect(high.priorityScore).toBeGreaterThan(low.priorityScore);
  });
});

describe("scoreKeywordSet", () => {
  it("returns an empty array for an empty set", () => {
    expect(scoreKeywordSet([])).toEqual([]);
  });

  it("scores a full set consistently with computePriorityScore given the set's own min/max", () => {
    const set: RawKeywordMetrics[] = [
      { rawVolume: 1000, rawDifficulty: 20, commercialIntent: 0.8, trend: 0.5, businessValue: 0.9 },
      { rawVolume: 5000, rawDifficulty: 60, commercialIntent: 0.3, trend: 0.2, businessValue: 0.4 },
      { rawVolume: 3000, rawDifficulty: 40, commercialIntent: 0.6, trend: 0.7, businessValue: 0.6 },
    ];

    const scored = scoreKeywordSet(set);
    expect(scored).toHaveLength(3);
    expect(scored[0].priorityScore).toBeCloseTo(0.575, 10);
    expect(scored[1].priorityScore).toBeCloseTo(0.43, 10);
    expect(scored[2].priorityScore).toBeCloseTo(0.56, 10);
  });

  it("normalizes to 0.5 for a single-keyword set (no variance)", () => {
    const scored = scoreKeywordSet([
      { rawVolume: 2000, rawDifficulty: 30, commercialIntent: 0.5, trend: 0.5, businessValue: 0.5 },
    ]);
    expect(scored[0].normalizedVolume).toBe(0.5);
    expect(scored[0].normalizedDifficulty).toBe(0.5);
    // 0.30*0.5 + 0.25*0.5 + 0.20*0.5 + 0.15*0.5 + 0.10*0.5 = 0.5
    expect(scored[0].priorityScore).toBeCloseTo(0.5, 10);
  });

  it("preserves original fields alongside the computed ones", () => {
    const scored = scoreKeywordSet([
      {
        rawVolume: 100,
        rawDifficulty: 10,
        commercialIntent: 0.1,
        trend: 0.1,
        businessValue: 0.1,
        term: "example keyword",
      },
    ]);
    expect(scored[0].term).toBe("example keyword");
  });
});
