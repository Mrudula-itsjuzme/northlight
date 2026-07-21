import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { gapReportTypeEnum } from "./enums";

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("competitors_brand_idx").on(table.brandId),
}));

export const competitorPages = pgTable("competitor_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  competitorId: uuid("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  contentSnapshot: text("content_snapshot"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("competitor_pages_brand_idx").on(table.brandId),
  competitorIdx: index("competitor_pages_competitor_idx").on(
    table.competitorId,
  ),
}));

export const gapReports = pgTable("gap_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  competitorId: uuid("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  type: gapReportTypeEnum("type").notNull(),
  findings: jsonb("findings").$type<Record<string, unknown>>().notNull(),
  priorityScore: real("priority_score"),
  isDemo: boolean("is_demo").notNull().default(false),
  generatedBy: text("generated_by").notNull().default("demo_adapter"), // demo_adapter | openai
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("gap_reports_brand_idx").on(table.brandId),
  competitorIdx: index("gap_reports_competitor_idx").on(table.competitorId),
}));
