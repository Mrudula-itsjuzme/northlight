import "server-only";

function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === "" ? undefined : value;
}

export const config = {
  openai: {
    get apiKey() { return getOptionalEnv("OPENAI_API_KEY"); },
    get chatModel() { return getOptionalEnv("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini"; },
    get embeddingModel() { return getOptionalEnv("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small"; },
    get apiBaseUrl() { return getOptionalEnv("OPENAI_API_BASE_URL") ?? "https://api.openai.com/v1"; },
    chatCompletionsPath: "/chat/completions",
    embeddingsPath: "/embeddings",
    defaultTimeoutMs: 30_000,
    maxRetries: 2,
    temperature: 0.2,
    visibilityTemperature: 0.3,
  },
  app: {
    get url() { return getOptionalEnv("NEXT_PUBLIC_APP_URL") ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"); },
    get env() { return process.env.NODE_ENV ?? "development"; },
    get isProduction() { return process.env.NODE_ENV === "production"; },
    get isDemo() { return process.env.NEXT_PUBLIC_DEMO_MODE === "true"; },
  },
  supabase: {
    get url() { return getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL"); },
    get anonKey() { return getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
    get serviceRoleKey() { return getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY"); },
    get databaseUrl() { return getOptionalEnv("DATABASE_URL"); },
  },
  jobs: {
    get workerSecret() { return getOptionalEnv("JOBS_WORKER_SECRET") ?? ""; },
    maxJobsPerRun: 25,
    claimStaleAfterMs: 5 * 60 * 1000,
    retryBackoffMs: 30_000,
  },
  ai: {
    get executionMode() { return getOptionalEnv("AI_EXECUTION_MODE") ?? "demo"; },
    embeddingDimensions: 1536,
    maxUploadBytes: 10 * 1024 * 1024,
    defaultChunkSize: 1000,
    defaultChunkOverlap: 150,
    costOptimizer: {
      tokenThresholdHigh: 8000,
      defaultModel: "gpt-4o-mini",
      highCapacityModel: "gpt-4o",
    },
  },
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
} as const;

export type Config = typeof config;