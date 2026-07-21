import { pgEnum } from "drizzle-orm/pg-core";

export const brandRoleEnum = pgEnum("brand_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

export const brandDocumentSourceEnum = pgEnum("brand_document_source", [
  "txt",
  "csv",
  "pdf",
  "docx",
  "typed_text",
]);

export const brandDocumentStatusEnum = pgEnum("brand_document_status", [
  "pending",
  "chunking",
  "embedding",
  "ready",
  "failed",
]);

export const gapReportTypeEnum = pgEnum("gap_report_type", [
  "content",
  "schema",
  "faq",
  "backlink",
  "ai_citation",
]);

export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "research",
  "strategy",
  "outline",
  "writer",
  "editor",
  "seo_optimizer",
  "fact_check",
  "schema_generator",
]);

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "retrying",
]);

export const articleStatusEnum = pgEnum("article_status", [
  "draft",
  "review",
  "approved",
  "published",
]);

export const claimStatusEnum = pgEnum("claim_status", [
  "unresolved",
  "resolved",
  "overridden",
]);

export const aiPlatformKeyEnum = pgEnum("ai_platform_key", [
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "copilot",
  "ai_overviews",
]);

export const sentimentEnum = pgEnum("sentiment", [
  "positive",
  "neutral",
  "negative",
  "unknown",
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "new",
  "in_progress",
  "done",
  "dismissed",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "embed_brand_document",
  "generate_content_brief",
  "run_content_pipeline",
  "generate_gap_report",
  "run_ai_visibility_snapshot",
  "compute_recommendations",
  "recompute_keyword_scores",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
