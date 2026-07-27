import "server-only";
import { z } from "zod";

export const cacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultTtlSeconds: z.number().nullable().default(86400), // 24 hours default
  stageTtlSeconds: z.record(z.string(), z.number()).default({
    research: 86400,
    strategy: 86400,
    outline: 86400,
    writer: 43200, // 12 hours
    editor: 43200,
    seo_optimizer: 86400,
    fact_check: 86400,
    schema_generator: 86400,
  }),
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

export const cacheConfig = cacheConfigSchema.parse({
  enabled: process.env.SEMANTIC_CACHE_ENABLED !== "false",
  defaultTtlSeconds: 86400,
  stageTtlSeconds: {
    research: 86400,
    strategy: 86400,
    outline: 86400,
    writer: 43200,
    editor: 43200,
    seo_optimizer: 86400,
    fact_check: 86400,
    schema_generator: 86400,
  },
});

export function getStageTtlSeconds(stage: string): number | undefined {
  return cacheConfig.stageTtlSeconds[stage] ?? cacheConfig.defaultTtlSeconds ?? undefined;
}
