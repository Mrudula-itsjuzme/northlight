import { z } from "zod";

export const keywordSchema = z.object({
  term: z.string().min(1, "Keyword is required").max(300),
  rawVolume: z.number().nonnegative(),
  rawDifficulty: z.number().min(0).max(100),
  rawCommercialIntent: z.number().min(0).max(1),
  rawTrend: z.number().min(0).max(1),
  rawBusinessValue: z.number().min(0).max(1),
});

export type KeywordInput = z.infer<typeof keywordSchema>;

const keywordCsvRawRowSchema = z.object({
  term: z.string().trim().min(1, "Keyword term is required"),
  volume: z.string().trim().optional(),
  difficulty: z.string().trim().optional(),
  commercial_intent: z.string().trim().optional(),
  trend: z.string().trim().optional(),
  business_value: z.string().trim().optional(),
});

function parseNumberOr(value: string | undefined, fallback: number): number {
  if (!value || value.length === 0) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Validates+transforms a single CSV row into a KeywordInput. See parseProductCsvRow for why this isn't a .pipe(). */
export function parseKeywordCsvRow(raw: unknown): ReturnType<typeof keywordSchema.safeParse> {
  const rawResult = keywordCsvRawRowSchema.safeParse(raw);
  if (!rawResult.success) {
    return rawResult as unknown as ReturnType<typeof keywordSchema.safeParse>;
  }

  const row = rawResult.data;
  return keywordSchema.safeParse({
    term: row.term,
    rawVolume: parseNumberOr(row.volume, 0),
    rawDifficulty: parseNumberOr(row.difficulty, 0),
    rawCommercialIntent: parseNumberOr(row.commercial_intent, 0),
    rawTrend: parseNumberOr(row.trend, 0),
    rawBusinessValue: parseNumberOr(row.business_value, 0),
  });
}

export const keywordFilterSchema = z.object({
  search: z.string().optional(),
  minPriority: z.number().min(0).max(1).optional(),
  maxPriority: z.number().min(0).max(1).optional(),
  sortBy: z
    .enum(["priorityScore", "rawVolume", "rawDifficulty", "term", "createdAt"])
    .default("priorityScore"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export type KeywordFilterInput = z.infer<typeof keywordFilterSchema>;
