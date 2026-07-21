import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { aiPlatformKeyEnum, sentimentEnum } from "./enums";

/**
 * Global reference table (not tenant-owned — no brand_id). Seeded once with
 * one row per supported platform. `hasLiveAdapter` reflects whether a real
 * provider integration is configured (only OpenAI/ChatGPT can ever be
 * "live" per the plan's single-provider constraint); all others are always
 * demo. AI Visibility is directional only, never an official citation
 * count — this is stated in the UI methodology copy, not just here.
 */
export const aiPlatforms = pgTable("ai_platforms", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: aiPlatformKeyEnum("key").notNull(),
  displayName: text("display_name").notNull(),
  hasLiveAdapter: boolean("has_live_adapter").notNull().default(false),
}, (table) => ({
  keyIdx: uniqueIndex("ai_platforms_key_idx").on(table.key),
}));

export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  promptText: text("prompt_text").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("ai_prompts_brand_idx").on(table.brandId),
}));

export const aiVisibilitySnapshots = pgTable("ai_visibility_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => aiPrompts.id, { onDelete: "cascade" }),
  platformId: uuid("platform_id")
    .notNull()
    .references(() => aiPlatforms.id, { onDelete: "cascade" }),
  mentioned: boolean("mentioned").notNull().default(false),
  position: integer("position"), // 1-based rank among mentioned brands, null if not mentioned
  sentiment: sentimentEnum("sentiment").notNull().default("unknown"),
  confidence: real("confidence"), // 0-1, parser's confidence in its own extraction
  rawResponse: text("raw_response").notNull(),
  isDemo: boolean("is_demo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("ai_visibility_snapshots_brand_idx").on(table.brandId),
  promptIdx: index("ai_visibility_snapshots_prompt_idx").on(table.promptId),
  platformIdx: index("ai_visibility_snapshots_platform_idx").on(
    table.platformId,
  ),
}));
