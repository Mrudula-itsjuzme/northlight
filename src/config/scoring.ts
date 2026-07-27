import "server-only";
import { z } from "zod";

export const scoringConfigSchema = z.object({
  article: z.object({
    maxMetaTitleChars: z.number().positive().default(60),
    maxMetaDescChars: z.number().positive().default(155),
    minEeatWordCount: z.number().positive().default(300),
    minAiReadinessHeadings: z.number().positive().default(2),
  }),
  gapAnalysis: z.object({
    severityWeights: z.object({
      low: z.number().min(0).max(1).default(0.2),
      medium: z.number().min(0).max(1).default(0.5),
      high: z.number().min(0).max(1).default(0.9),
    }),
  }),
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const scoringConfig = scoringConfigSchema.parse({
  article: {
    maxMetaTitleChars: 60,
    maxMetaDescChars: 155,
    minEeatWordCount: 300,
    minAiReadinessHeadings: 2,
  },
  gapAnalysis: {
    severityWeights: {
      low: 0.2,
      medium: 0.5,
      high: 0.9,
    },
  },
});
