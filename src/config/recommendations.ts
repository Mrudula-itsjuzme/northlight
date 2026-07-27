import "server-only";
import { z } from "zod";

export const recommendationsConfigSchema = z.object({
  sourceWeights: z.object({
    keyword: z.number().min(0).max(1).default(0.3),
    competitor: z.number().min(0).max(1).default(0.3),
    content: z.number().min(0).max(1).default(0.2),
    visibility: z.number().min(0).max(1).default(0.2),
  }),
  confidence: z.object({
    keyword: z.number().min(0).max(1).default(0.7),
    competitor: z.number().min(0).max(1).default(0.6),
    content: z.number().min(0).max(1).default(0.8),
    visibility: z.number().min(0).max(1).default(0.5),
  }),
  thresholds: z.object({
    keywordMinPriority: z.number().min(0).max(1).default(0.5),
    contentMaxAvgScore: z.number().min(0).max(100).default(80),
    visibilityGapRatio: z.number().min(0).max(1).default(0.5),
  }),
  learning: z.object({
    minSampleThreshold: z.number().positive().default(5),
    bayesianM: z.number().nonnegative().default(4),
    minWeightBound: z.number().min(0).max(1).default(0.05),
    maxWeightBound: z.number().min(0).max(1).default(0.40),
  }),
});

export type RecommendationsConfig = z.infer<typeof recommendationsConfigSchema>;

export const recommendationsConfig = recommendationsConfigSchema.parse({
  sourceWeights: {
    keyword: 0.3,
    competitor: 0.3,
    content: 0.2,
    visibility: 0.2,
  },
  confidence: {
    keyword: 0.7,
    competitor: 0.6,
    content: 0.8,
    visibility: 0.5,
  },
  thresholds: {
    keywordMinPriority: 0.5,
    contentMaxAvgScore: 80,
    visibilityGapRatio: 0.5,
  },
  learning: {
    minSampleThreshold: 5,
    bayesianM: 4,
    minWeightBound: 0.05,
    maxWeightBound: 0.40,
  },
});
