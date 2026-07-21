import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";

/**
 * Keywords store BOTH raw inputs (volume, difficulty, commercial intent,
 * trend, business value) AND the computed priority score, per the plan's
 * requirement. The exact formula (see AI_SCORING.md / src/lib/scoring) is:
 *
 *   priority = 0.30 * normalizedVolume
 *            + 0.25 * (1 - normalizedDifficulty)
 *            + 0.20 * commercialIntent
 *            + 0.15 * trend
 *            + 0.10 * businessValue
 *
 * normalizedVolume/normalizedDifficulty are derived from raw volume/
 * difficulty at scoring time (min-max normalized against the brand's
 * keyword set) and persisted alongside the raw values so the computation
 * is reproducible and auditable.
 */
export const keywords = pgTable("keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  term: text("term").notNull(),

  // Raw inputs (0-100 scale for volume/difficulty; 0-1 for the rest)
  rawVolume: real("raw_volume").notNull().default(0),
  rawDifficulty: real("raw_difficulty").notNull().default(0),
  rawCommercialIntent: real("raw_commercial_intent").notNull().default(0),
  rawTrend: real("raw_trend").notNull().default(0),
  rawBusinessValue: real("raw_business_value").notNull().default(0),

  // Normalized inputs actually fed into the formula (persisted for audit)
  normalizedVolume: real("normalized_volume"),
  normalizedDifficulty: real("normalized_difficulty"),

  // Computed output
  priorityScore: real("priority_score"),

  // AI citation opportunity: directional signal for how likely this
  // keyword's topic is to be surfaced by generative AI answers. Always
  // qualitative/directional, never presented as a guaranteed outcome.
  aiCitationOpportunity: real("ai_citation_opportunity"),

  source: text("source").notNull().default("manual"), // manual | csv_import | demo_seed

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("keywords_brand_idx").on(table.brandId),
  brandTermIdx: uniqueIndex("keywords_brand_term_idx").on(
    table.brandId,
    table.term,
  ),
}));

/**
 * Append-only history of scoring runs, so re-scoring (e.g. after new
 * keywords change the normalization baseline) doesn't destroy the prior
 * computed values.
 */
export const keywordScores = pgTable("keyword_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  keywordId: uuid("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
  formulaVersion: integer("formula_version").notNull().default(1),
  normalizedVolume: real("normalized_volume").notNull(),
  normalizedDifficulty: real("normalized_difficulty").notNull(),
  commercialIntent: real("commercial_intent").notNull(),
  trend: real("trend").notNull(),
  businessValue: real("business_value").notNull(),
  priorityScore: real("priority_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("keyword_scores_brand_idx").on(table.brandId),
  keywordIdx: index("keyword_scores_keyword_idx").on(table.keywordId),
}));

export const keywordClusters = pgTable("keyword_clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("keyword_clusters_brand_idx").on(table.brandId),
}));

export const clusterKeywords = pgTable("cluster_keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  clusterId: uuid("cluster_id")
    .notNull()
    .references(() => keywordClusters.id, { onDelete: "cascade" }),
  keywordId: uuid("keyword_id")
    .notNull()
    .references(() => keywords.id, { onDelete: "cascade" }),
}, (table) => ({
  clusterKeywordIdx: uniqueIndex("cluster_keywords_cluster_keyword_idx").on(
    table.clusterId,
    table.keywordId,
  ),
  brandIdx: index("cluster_keywords_brand_idx").on(table.brandId),
}));
