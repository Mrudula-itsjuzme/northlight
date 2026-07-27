import "server-only";
import { z } from "zod";

function getEnv(key: string): string | undefined {
  const val = process.env[key];
  return val === undefined || val === "" ? undefined : val;
}

export const rateLimitItemSchema = z.object({
  capacity: z.number().positive(),
  windowMs: z.number().positive(),
});

export const limitsConfigSchema = z.object({
  rateLimits: z.object({
    contentBrief: rateLimitItemSchema.default({ capacity: 10, windowMs: 60_000 }),
    pipelineRun: rateLimitItemSchema.default({ capacity: 5, windowMs: 60_000 }),
    visibilitySnapshot: rateLimitItemSchema.default({ capacity: 10, windowMs: 60_000 }),
    documentUpload: rateLimitItemSchema.default({ capacity: 10, windowMs: 60_000 }),
    inviteSend: rateLimitItemSchema.default({ capacity: 20, windowMs: 3_600_000 }),
  }),
  competitor: z.object({
    fetchTimeoutMs: z.number().positive().default(8_000),
    maxResponseBytes: z.number().positive().default(2 * 1024 * 1024),
    userAgent: z.string().default("NorthlightBot/1.0 (+https://northlight.app/bot)"),
  }),
  publishing: z.object({
    demoBaseUrl: z.string().url().default("https://example.com/blog"),
  }),
  brand: z.object({
    demoCompetitors: z.array(z.string()).default(["Rivalia", "Glowmane", "Silkcurl Co", "Tresora"]),
  }),
  cookie: z.object({
    currentBrandName: z.string().default("nl_current_brand"),
    maxAgeDays: z.number().positive().default(365),
  }),
  invite: z.object({
    tokenBytes: z.number().positive().default(24),
    expiryDays: z.number().positive().default(7),
  }),
  app: z.object({
    url: z.string().default("http://localhost:3000"),
    env: z.string().default("development"),
    isProduction: z.boolean().default(false),
    isDemo: z.boolean().default(false),
  }),
});

export type LimitsConfig = z.infer<typeof limitsConfigSchema>;

const appUrl = getEnv("NEXT_PUBLIC_APP_URL") ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const nodeEnv = process.env.NODE_ENV ?? "development";

export const limitsConfig = limitsConfigSchema.parse({
  rateLimits: {
    contentBrief: { capacity: 10, windowMs: 60_000 },
    pipelineRun: { capacity: 5, windowMs: 60_000 },
    visibilitySnapshot: { capacity: 10, windowMs: 60_000 },
    documentUpload: { capacity: 10, windowMs: 60_000 },
    inviteSend: { capacity: 20, windowMs: 3_600_000 },
  },
  competitor: {
    fetchTimeoutMs: 8_000,
    maxResponseBytes: 2 * 1024 * 1024,
    userAgent: "NorthlightBot/1.0 (+https://northlight.app/bot)",
  },
  publishing: {
    demoBaseUrl: "https://example.com/blog",
  },
  brand: {
    demoCompetitors: ["Rivalia", "Glowmane", "Silkcurl Co", "Tresora"],
  },
  cookie: {
    currentBrandName: "nl_current_brand",
    maxAgeDays: 365,
  },
  invite: {
    tokenBytes: 24,
    expiryDays: 7,
  },
  app: {
    url: appUrl,
    env: nodeEnv,
    isProduction: nodeEnv === "production",
    isDemo: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  },
});
