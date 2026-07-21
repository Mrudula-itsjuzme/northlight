import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { jobStatusEnum, jobTypeEnum } from "./enums";

/**
 * Postgres-backed job queue. No Redis/BullMQ per the plan's constraints.
 * A worker route/script polls for rows where status = 'queued' AND
 * run_at <= now(), claims them (status -> 'running'), executes, and
 * records the result. `brand_id` is nullable because a small number of
 * job types (e.g. future cross-tenant maintenance) may not be tenant-scoped,
 * but every job type currently defined in this app IS tenant-scoped.
 */
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id, {
    onDelete: "cascade",
  }),
  type: jobTypeEnum("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: jobStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("jobs_brand_idx").on(table.brandId),
  statusRunAtIdx: index("jobs_status_run_at_idx").on(
    table.status,
    table.runAt,
  ),
}));
