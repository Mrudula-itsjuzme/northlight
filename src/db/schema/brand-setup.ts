import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { brands } from "./tenancy";
import { brandDocumentSourceEnum, brandDocumentStatusEnum } from "./enums";

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // shopify, woocommerce, custom, etc.
  storeUrl: text("store_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("stores_brand_idx").on(table.brandId),
}));

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  sku: text("sku"),
  priceCents: integer("price_cents"),
  description: text("description"),
  productUrl: text("product_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("products_brand_idx").on(table.brandId),
}));

export const brandDocuments = pgTable("brand_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceType: brandDocumentSourceEnum("source_type").notNull(),
  storagePath: text("storage_path"), // Supabase Storage path for file uploads
  rawText: text("raw_text"), // for typed_text source or extracted text
  status: brandDocumentStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("brand_documents_brand_idx").on(table.brandId),
}));

/**
 * Embedding dimension is 1536 (OpenAI text-embedding-3-small). The demo
 * hash-embedding adapter (used with no OPENAI_API_KEY) also produces
 * 1536-dim vectors so the column type stays consistent regardless of which
 * adapter created it. See AI_SCORING.md for the demo embedding method.
 */
export const brandDocumentChunks = pgTable("brand_document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  brandDocumentId: uuid("brand_document_id")
    .notNull()
    .references(() => brandDocuments.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  brandIdx: index("brand_document_chunks_brand_idx").on(table.brandId),
  docIdx: index("brand_document_chunks_doc_idx").on(table.brandDocumentId),
}));

