/**
 * Drizzle schema. Phase 0 placeholder — the full multi-tenant schema
 * (profiles, brands, brand_members, keywords, competitors, content
 * pipeline, articles, AI visibility, recommendations, jobs, etc.) is added
 * in Phase 1. Kept as a real (if minimal) table so `drizzle-kit` and the
 * db client both have something valid to compile against.
 */
import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const _scaffold = pgTable("_scaffold", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
