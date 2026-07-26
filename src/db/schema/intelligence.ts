import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { articles, contentPipelineRuns } from "./content";
import { aiPrompts } from "./ai-visibility";

export const aiEvaluations = pgTable(
  "ai_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").references(() => articles.id, {
      onDelete: "cascade",
    }),
    runId: uuid("run_id").references(() => contentPipelineRuns.id, {
      onDelete: "cascade",
    }),
    overallScore: real("overall_score").notNull(),
    factualGroundingScore: real("factual_grounding_score").notNull(),
    brandBrainGroundingScore: real("brand_brain_grounding_score").notNull(),
    brandVoiceScore: real("brand_voice_score").notNull(),
    readabilityScore: real("readability_score").notNull(),
    seoQualityScore: real("seo_quality_score").notNull(),
    entityCoverageScore: real("entity_coverage_score").notNull(),
    duplicateDetectionScore: real("duplicate_detection_score").notNull(),
    hallucinationLikelihoodScore: real("hallucination_likelihood_score").notNull(),
    structureQualityScore: real("structure_quality_score").notNull(),
    citationCoverageScore: real("citation_coverage_score").notNull(),
    explanation: text("explanation"),
    categoryScores: jsonb("category_scores").$type<Record<string, number>>(),
    evaluatorVersion: text("evaluator_version").notNull().default("v1.0.0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("ai_evaluations_brand_idx").on(table.brandId),
    articleIdx: index("ai_evaluations_article_idx").on(table.articleId),
  }),
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptKey: text("prompt_key").notNull(),
    version: text("version").notNull(),
    promptText: text("prompt_text").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    trafficPercentage: integer("traffic_percentage").notNull().default(100),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    experimentName: text("experiment_name"),
    activationDate: timestamp("activation_date", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    keyIdx: index("prompt_versions_key_idx").on(table.promptKey),
    brandIdx: index("prompt_versions_brand_idx").on(table.brandId),
  }),
);

export const promptVersionTelemetry = pgTable(
  "prompt_version_telemetry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptVersionId: uuid("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id, { onDelete: "cascade" }),
    generationLatencyMs: integer("generation_latency_ms").notNull(),
    evaluationScore: real("evaluation_score"),
    humanEditsCount: integer("human_edits_count").notNull().default(0),
    published: boolean("published").notNull().default(false),
    recommendationAccepted: boolean("recommendation_accepted"),
    tokensUsed: integer("tokens_used").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    versionIdx: index("prompt_telemetry_version_idx").on(table.promptVersionId),
  }),
);

export const recommendationFeedback = pgTable(
  "recommendation_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    recommendationId: text("recommendation_id").notNull(),
    sourceSignal: text("source_signal").notNull(),
    action: text("action").notNull(), // 'accepted' | 'ignored' | 'dismissed' | 'postponed' | 'manually_edited'
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("recommendation_feedback_brand_idx").on(table.brandId),
  }),
);

export const campaignMemories = pgTable(
  "campaign_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    campaignGoals: text("campaign_goals"),
    toneAndStyle: text("tone_and_style"),
    keyMessaging: text("key_messaging"),
    ctas: jsonb("ctas").$type<string[]>(),
    seasonalContext: text("seasonal_context"),
    targetPersonas: jsonb("target_personas").$type<string[]>(),
    publishingCadence: text("publishing_cadence"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("campaign_memories_brand_idx").on(table.brandId),
  }),
);

export const aiSemanticCache = pgTable(
  "ai_semantic_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestHash: text("request_hash").notNull().unique(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    promptVersion: text("prompt_version").notNull(),
    brandBrainRevision: text("brand_brain_revision"),
    executionMode: text("execution_mode").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    cachedResponse: jsonb("cached_response").$type<Record<string, unknown>>().notNull(),
    tokensSaved: integer("tokens_saved").notNull().default(0),
    costSavedCents: integer("cost_saved_cents").notNull().default(0),
    hitCount: integer("hit_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    hashIdx: index("ai_cache_hash_idx").on(table.requestHash),
    brandIdx: index("ai_cache_brand_idx").on(table.brandId),
  }),
);

export const knowledgeGraphNodes = pgTable(
  "knowledge_graph_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    entityName: text("entity_name").notNull(),
    entityType: text("entity_type").notNull(), // 'product' | 'service' | 'competitor' | 'person' | 'brand' | 'technology' | 'location' | 'industry'
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("kg_nodes_brand_idx").on(table.brandId),
    nameIdx: index("kg_nodes_name_idx").on(table.entityName),
  }),
);

export const knowledgeGraphEdges = pgTable(
  "knowledge_graph_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => knowledgeGraphNodes.id, { onDelete: "cascade" }),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => knowledgeGraphNodes.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").notNull(), // 'belongs_to' | 'competes_with' | 'uses' | 'offers' | 'targets' | 'located_in'
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("kg_edges_brand_idx").on(table.brandId),
  }),
);

export const visibilityAlerts = pgTable(
  "visibility_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => aiPrompts.id, { onDelete: "cascade" }),
    platformKey: text("platform_key").notNull(),
    alertType: text("alert_type").notNull(), // 'rank_drop' | 'mention_lost' | 'provider_unavailable'
    previousPosition: integer("previous_position"),
    currentPosition: integer("current_position"),
    message: text("message").notNull(),
    isResolved: boolean("is_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    brandIdx: index("visibility_alerts_brand_idx").on(table.brandId),
  }),
);

export const performanceBenchmarks = pgTable(
  "performance_benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchmarkName: text("benchmark_name").notNull(),
    metricName: text("metric_name").notNull(),
    metricValue: real("metric_value").notNull(),
    unit: text("unit").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    nameIdx: index("perf_bench_name_idx").on(table.benchmarkName),
  }),
);
