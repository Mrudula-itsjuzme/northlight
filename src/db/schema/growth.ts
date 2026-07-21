import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { recommendationStatusEnum } from "./enums";

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  impact: text("impact").notNull(), // low | medium | high (qualitative label)
  confidence: real("confidence").notNull(), // 0-1
  action: text("action").notNull(), // suggested next step, human-readable
  sourceSignal: text("source_signal").notNull(), // keyword | competitor | content | visibility
  status: recommendationStatusEnum("status").notNull().default("new"),
  rankScore: real("rank_score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("recommendations_brand_idx").on(table.brandId),
}));

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("analytics_events_brand_idx").on(table.brandId),
  typeIdx: index("analytics_events_type_idx").on(table.eventType),
}));
