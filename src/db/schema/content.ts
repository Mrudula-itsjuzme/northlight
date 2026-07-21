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
import { keywords } from "./keywords";
import { profiles } from "./tenancy";
import {
  pipelineStageEnum,
  pipelineStatusEnum,
  articleStatusEnum,
  claimStatusEnum,
} from "./enums";

export const contentBriefs = pgTable("content_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  keywordId: uuid("keyword_id").references(() => keywords.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  targetAudience: text("target_audience"),
  searchIntent: text("search_intent"),
  outline: jsonb("outline").$type<Array<{ heading: string; notes?: string }>>(),
  requiredSections: jsonb("required_sections").$type<string[]>(),
  toneAndStyle: text("tone_and_style"),
  competitorReferences: jsonb("competitor_references").$type<string[]>(),
  targetWordCount: integer("target_word_count"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("content_briefs_brand_idx").on(table.brandId),
}));

export const contentPipelineRuns = pgTable("content_pipeline_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  briefId: uuid("brief_id")
    .notNull()
    .references(() => contentBriefs.id, { onDelete: "cascade" }),
  articleId: uuid("article_id"), // set once the run produces/updates an article
  status: pipelineStatusEnum("status").notNull().default("pending"),
  currentStage: pipelineStageEnum("current_stage"),
  totalCostCents: integer("total_cost_cents").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("content_pipeline_runs_brand_idx").on(table.brandId),
  briefIdx: index("content_pipeline_runs_brief_idx").on(table.briefId),
}));

export const contentPipelineSteps = pgTable("content_pipeline_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => contentPipelineRuns.id, { onDelete: "cascade" }),
  stage: pipelineStageEnum("stage").notNull(),
  status: pipelineStatusEnum("status").notNull().default("pending"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  attempt: integer("attempt").notNull().default(1),
  costCents: integer("cost_cents").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("content_pipeline_steps_brand_idx").on(table.brandId),
  runIdx: index("content_pipeline_steps_run_idx").on(table.runId),
}));

export const articles = pgTable("articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  briefId: uuid("brief_id").references(() => contentBriefs.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: articleStatusEnum("status").notNull().default("draft"),
  currentVersionId: uuid("current_version_id"),
  seoScore: real("seo_score"),
  eeatScore: real("eeat_score"),
  aiReadinessScore: real("ai_readiness_score"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("articles_brand_idx").on(table.brandId),
}));

export const articleVersions = pgTable("article_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(), // HTML or markdown body
  authorId: uuid("author_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("article_versions_brand_idx").on(table.brandId),
  articleIdx: index("article_versions_article_idx").on(table.articleId),
}));

/**
 * Publish gate: an article with any article_claims row in status
 * 'unresolved' must not be published, unless an owner-role override is
 * recorded (status becomes 'overridden' with override fields populated,
 * which itself is the audit record). Enforced both in the API layer
 * (src/lib/content/publish-gate.ts) and covered by an automated test.
 */
export const articleClaims = pgTable("article_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  claimText: text("claim_text").notNull(),
  status: claimStatusEnum("status").notNull().default("unresolved"),
  resolutionNote: text("resolution_note"),
  resolvedBy: uuid("resolved_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  overrideBy: uuid("override_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  overrideReason: text("override_reason"),
  overrideAt: timestamp("override_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("article_claims_brand_idx").on(table.brandId),
  articleIdx: index("article_claims_article_idx").on(table.articleId),
}));

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  articleId: uuid("article_id").references(() => articles.id, {
    onDelete: "cascade",
  }),
  storagePath: text("storage_path"),
  externalUrl: text("external_url"),
  altText: text("alt_text"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("images_brand_idx").on(table.brandId),
  articleIdx: index("images_article_idx").on(table.articleId),
}));

export const schemaObjects = pgTable("schema_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  jsonLd: jsonb("json_ld").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("schema_objects_brand_idx").on(table.brandId),
  articleIdx: index("schema_objects_article_idx").on(table.articleId),
}));

export const publications = pgTable("publications", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  publishedBy: uuid("published_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  channel: text("channel").notNull().default("northlight_cms"),
  wasOverride: boolean("was_override").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("publications_brand_idx").on(table.brandId),
  articleIdx: index("publications_article_idx").on(table.articleId),
}));
