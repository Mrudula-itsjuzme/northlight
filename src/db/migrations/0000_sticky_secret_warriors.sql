-- pgvector extension for semantic search over brand_document_chunks.embedding.
-- On a real Supabase project this extension is available by default; on a
-- local/test Postgres it must be installed (pglite ships it as a bundled
-- extension, see tests/db/pglite.ts).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ai_platform_key" AS ENUM('chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'ai_overviews');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'review', 'approved', 'published');--> statement-breakpoint
CREATE TYPE "public"."brand_document_source" AS ENUM('txt', 'csv', 'pdf', 'docx', 'typed_text');--> statement-breakpoint
CREATE TYPE "public"."brand_document_status" AS ENUM('pending', 'chunking', 'embedding', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."brand_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('unresolved', 'resolved', 'overridden');--> statement-breakpoint
CREATE TYPE "public"."gap_report_type" AS ENUM('content', 'schema', 'faq', 'backlink', 'ai_citation');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('embed_brand_document', 'generate_content_brief', 'run_content_pipeline', 'generate_gap_report', 'run_ai_visibility_snapshot', 'compute_recommendations', 'recompute_keyword_scores');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('research', 'strategy', 'outline', 'writer', 'editor', 'seo_optimizer', 'fact_check', 'schema_generator');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('pending', 'running', 'completed', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('new', 'in_progress', 'done', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TABLE "brand_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "brand_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"vertical" text,
	"website_url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "brand_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- On a real Supabase project, profiles.id should also carry:
--   REFERENCES auth.users(id) ON DELETE CASCADE
-- Drizzle's schema (src/db/schema/tenancy.ts) does not declare this FK
-- because the `auth` schema does not exist on non-Supabase Postgres
-- (including the pglite instance used for tests). It is added by a
-- Supabase-only migration snippet documented in DATABASE.md, applied via
-- `supabase db push` alongside this migration.
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"brand_document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" "brand_document_source" NOT NULL,
	"storage_path" text,
	"raw_text" text,
	"status" "brand_document_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"store_id" uuid,
	"name" text NOT NULL,
	"sku" text,
	"price_cents" integer,
	"description" text,
	"product_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"store_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cluster_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"formula_version" integer DEFAULT 1 NOT NULL,
	"normalized_volume" real NOT NULL,
	"normalized_difficulty" real NOT NULL,
	"commercial_intent" real NOT NULL,
	"trend" real NOT NULL,
	"business_value" real NOT NULL,
	"priority_score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"term" text NOT NULL,
	"raw_volume" real DEFAULT 0 NOT NULL,
	"raw_difficulty" real DEFAULT 0 NOT NULL,
	"raw_commercial_intent" real DEFAULT 0 NOT NULL,
	"raw_trend" real DEFAULT 0 NOT NULL,
	"raw_business_value" real DEFAULT 0 NOT NULL,
	"normalized_volume" real,
	"normalized_difficulty" real,
	"priority_score" real,
	"ai_citation_opportunity" real,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"content_snapshot" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gap_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"type" "gap_report_type" NOT NULL,
	"findings" jsonb NOT NULL,
	"priority_score" real,
	"is_demo" boolean DEFAULT false NOT NULL,
	"generated_by" text DEFAULT 'demo_adapter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"claim_text" text NOT NULL,
	"status" "claim_status" DEFAULT 'unresolved' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"override_by" uuid,
	"override_reason" text,
	"override_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"brief_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"seo_score" real,
	"eeat_score" real,
	"ai_readiness_score" real,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"keyword_id" uuid,
	"title" text NOT NULL,
	"target_audience" text,
	"search_intent" text,
	"outline" jsonb,
	"required_sections" jsonb,
	"tone_and_style" text,
	"competitor_references" jsonb,
	"target_word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"article_id" uuid,
	"status" "pipeline_status" DEFAULT 'pending' NOT NULL,
	"current_stage" "pipeline_stage",
	"total_cost_cents" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_pipeline_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" "pipeline_stage" NOT NULL,
	"status" "pipeline_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_message" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid,
	"storage_path" text,
	"external_url" text,
	"alt_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"published_by" uuid,
	"channel" text DEFAULT 'northlight_cms' NOT NULL,
	"was_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"json_ld" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "ai_platform_key" NOT NULL,
	"display_name" text NOT NULL,
	"has_live_adapter" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_visibility_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"platform_id" uuid NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"position" integer,
	"sentiment" "sentiment" DEFAULT 'unknown' NOT NULL,
	"confidence" real,
	"raw_response" text NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"impact" text NOT NULL,
	"confidence" real NOT NULL,
	"action" text NOT NULL,
	"source_signal" text NOT NULL,
	"status" "recommendation_status" DEFAULT 'new' NOT NULL,
	"rank_score" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid,
	"type" "job_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_members" ADD CONSTRAINT "brand_members_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_members" ADD CONSTRAINT "brand_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_document_chunks" ADD CONSTRAINT "brand_document_chunks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_document_chunks" ADD CONSTRAINT "brand_document_chunks_brand_document_id_brand_documents_id_fk" FOREIGN KEY ("brand_document_id") REFERENCES "public"."brand_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_documents" ADD CONSTRAINT "brand_documents_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_keywords" ADD CONSTRAINT "cluster_keywords_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_keywords" ADD CONSTRAINT "cluster_keywords_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_keywords" ADD CONSTRAINT "cluster_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_scores" ADD CONSTRAINT "keyword_scores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_scores" ADD CONSTRAINT "keyword_scores_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_pages" ADD CONSTRAINT "competitor_pages_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_pages" ADD CONSTRAINT "competitor_pages_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_reports" ADD CONSTRAINT "gap_reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_reports" ADD CONSTRAINT "gap_reports_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_override_by_profiles_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_brief_id_content_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."content_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pipeline_runs" ADD CONSTRAINT "content_pipeline_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pipeline_runs" ADD CONSTRAINT "content_pipeline_runs_brief_id_content_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."content_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pipeline_steps" ADD CONSTRAINT "content_pipeline_steps_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pipeline_steps" ADD CONSTRAINT "content_pipeline_steps_run_id_content_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."content_pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_published_by_profiles_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_objects" ADD CONSTRAINT "schema_objects_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_objects" ADD CONSTRAINT "schema_objects_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_snapshots" ADD CONSTRAINT "ai_visibility_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_snapshots" ADD CONSTRAINT "ai_visibility_snapshots_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_visibility_snapshots" ADD CONSTRAINT "ai_visibility_snapshots_platform_id_ai_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."ai_platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_members_brand_user_idx" ON "brand_members" USING btree ("brand_id","user_id");--> statement-breakpoint
CREATE INDEX "brand_members_user_idx" ON "brand_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_idx" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_idx" ON "invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invites_brand_idx" ON "invites" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_document_chunks_brand_idx" ON "brand_document_chunks" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_document_chunks_doc_idx" ON "brand_document_chunks" USING btree ("brand_document_id");--> statement-breakpoint
CREATE INDEX "brand_documents_brand_idx" ON "brand_documents" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "stores_brand_idx" ON "stores" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_keywords_cluster_keyword_idx" ON "cluster_keywords" USING btree ("cluster_id","keyword_id");--> statement-breakpoint
CREATE INDEX "cluster_keywords_brand_idx" ON "cluster_keywords" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "keyword_clusters_brand_idx" ON "keyword_clusters" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "keyword_scores_brand_idx" ON "keyword_scores" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "keyword_scores_keyword_idx" ON "keyword_scores" USING btree ("keyword_id");--> statement-breakpoint
CREATE INDEX "keywords_brand_idx" ON "keywords" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_brand_term_idx" ON "keywords" USING btree ("brand_id","term");--> statement-breakpoint
CREATE INDEX "competitor_pages_brand_idx" ON "competitor_pages" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "competitor_pages_competitor_idx" ON "competitor_pages" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitors_brand_idx" ON "competitors" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "gap_reports_brand_idx" ON "gap_reports" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "gap_reports_competitor_idx" ON "gap_reports" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "article_claims_brand_idx" ON "article_claims" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "article_claims_article_idx" ON "article_claims" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "article_versions_brand_idx" ON "article_versions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "article_versions_article_idx" ON "article_versions" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "articles_brand_idx" ON "articles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_briefs_brand_idx" ON "content_briefs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_runs_brand_idx" ON "content_pipeline_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_runs_brief_idx" ON "content_pipeline_runs" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_steps_brand_idx" ON "content_pipeline_steps" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "content_pipeline_steps_run_idx" ON "content_pipeline_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "images_brand_idx" ON "images" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "images_article_idx" ON "images" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "publications_brand_idx" ON "publications" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "publications_article_idx" ON "publications" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "schema_objects_brand_idx" ON "schema_objects" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "schema_objects_article_idx" ON "schema_objects" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_platforms_key_idx" ON "ai_platforms" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ai_prompts_brand_idx" ON "ai_prompts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ai_visibility_snapshots_brand_idx" ON "ai_visibility_snapshots" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "ai_visibility_snapshots_prompt_idx" ON "ai_visibility_snapshots" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "ai_visibility_snapshots_platform_idx" ON "ai_visibility_snapshots" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "analytics_events_brand_idx" ON "analytics_events" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "recommendations_brand_idx" ON "recommendations" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "subscriptions_brand_idx" ON "subscriptions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "usage_events_brand_idx" ON "usage_events" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "jobs_brand_idx" ON "jobs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "jobs_status_run_at_idx" ON "jobs" USING btree ("status","run_at");