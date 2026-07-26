ALTER TABLE "article_claims" ADD COLUMN "verification_status" text DEFAULT 'requires_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "article_claims" ADD COLUMN "source_reference" text;--> statement-breakpoint
ALTER TABLE "article_claims" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "external_content_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "jobs_idempotency_idx" ON "jobs" USING btree ("idempotency_key");