import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { brandRoleEnum, inviteStatusEnum } from "./enums";

/**
 * Mirrors auth.users 1:1. `id` is the Supabase auth user id (not a
 * default-random uuid) so it can be a foreign key target for brand_members.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** The tenant root. Every tenant-owned table carries brand_id back to this. */
export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  vertical: text("vertical"),
  websiteUrl: text("website_url"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex("brands_slug_idx").on(table.slug),
}));

/**
 * The join table every RLS policy in the app keys off of. A user can read/
 * write a tenant-owned row iff there exists a brand_members row for
 * (auth.uid(), row.brand_id).
 */
export const brandMembers = pgTable("brand_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  role: brandRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandUserIdx: uniqueIndex("brand_members_brand_user_idx").on(
    table.brandId,
    table.userId,
  ),
  userIdx: index("brand_members_user_idx").on(table.userId),
}));

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: brandRoleEnum("role").notNull().default("viewer"),
  token: text("token").notNull(),
  status: inviteStatusEnum("status").notNull().default("pending"),
  invitedBy: uuid("invited_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex("invites_token_idx").on(table.token),
  brandIdx: index("invites_brand_idx").on(table.brandId),
}));
