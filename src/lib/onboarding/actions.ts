"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, products, brandDocuments, jobs, keywords } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import {
  storeSchema,
  productSchema,
  brandDocumentTextSchema,
  type StoreInput,
  type ProductInput,
  type BrandDocumentTextInput,
} from "@/lib/validation/products";
import { parseProductsCsv, type CsvRowError } from "@/lib/csv/parse-products";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function addStore(
  brandId: string,
  input: StoreInput,
): Promise<ActionResult<{ storeId: string }>> {
  const parsed = storeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [store] = await db
      .insert(stores)
      .values({
        brandId,
        platform: parsed.data.platform,
        storeUrl: parsed.data.storeUrl || null,
      })
      .returning({ id: stores.id });

    revalidatePath("/onboarding");
    return { ok: true, data: { storeId: store.id } };
  } catch (err) {
    return toActionError(err, "Failed to add store.");
  }
}

export async function addProduct(
  brandId: string,
  input: ProductInput,
): Promise<ActionResult<{ productId: string }>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        brandId,
        name: parsed.data.name,
        sku: parsed.data.sku || null,
        priceCents: parsed.data.priceCents ?? null,
        description: parsed.data.description || null,
        productUrl: parsed.data.productUrl || null,
      })
      .returning({ id: products.id });

    revalidatePath("/onboarding");
    return { ok: true, data: { productId: product.id } };
  } catch (err) {
    return toActionError(err, "Failed to add product.");
  }
}

export type ImportProductsCsvResult = {
  imported: number;
  totalRows: number;
  rowErrors: CsvRowError[];
};

/**
 * Imports products from a CSV file's raw text contents. Bad rows are
 * reported (row number + reason) rather than silently dropped; valid rows
 * are still imported even if some rows in the same file failed validation.
 */
export async function importProductsCsv(
  brandId: string,
  csvContents: string,
): Promise<ActionResult<ImportProductsCsvResult>> {
  try {
    await requireRoleOrThrow(brandId, "editor");

    const { validRows, errors, totalRows } = parseProductsCsv(csvContents);

    if (validRows.length > 0) {
      const db = getDb();
      await db.insert(products).values(
        validRows.map((row) => ({
          brandId,
          name: row.name,
          sku: row.sku || null,
          priceCents: row.priceCents ?? null,
          description: row.description || null,
          productUrl: row.productUrl || null,
        })),
      );
    }

    revalidatePath("/onboarding");
    return {
      ok: true,
      data: { imported: validRows.length, totalRows, rowErrors: errors },
    };
  } catch (err) {
    return toActionError(err, "Failed to import products.");
  }
}

/**
 * Adds a brand document from typed/pasted text (TXT/CSV file upload and
 * PDF/DOCX extraction are Phase 4's job; this covers the `typed_text`
 * source type end-to-end now). Marks it `pending` and enqueues an
 * `embed_brand_document` job — the actual chunking/embedding worker logic
 * lands in Phase 4/12, but the row + job creation is real, not a stub.
 */
export async function addBrandDocumentText(
  brandId: string,
  input: BrandDocumentTextInput,
): Promise<ActionResult<{ documentId: string }>> {
  const parsed = brandDocumentTextSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const documentId = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(brandDocuments)
        .values({
          brandId,
          title: parsed.data.title,
          sourceType: "typed_text",
          rawText: parsed.data.rawText,
          status: "pending",
        })
        .returning({ id: brandDocuments.id });

      await tx.insert(jobs).values({
        brandId,
        type: "embed_brand_document",
        payload: { brandDocumentId: doc.id },
      });

      return doc.id;
    });

    revalidatePath("/onboarding");
    return { ok: true, data: { documentId } };
  } catch (err) {
    return toActionError(err, "Failed to add brand document.");
  }
}

export async function skipBrandDocuments(brandId: string): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    // No-op beyond authorization: the onboarding state machine treats "zero
    // documents" as a valid (skippable) state already, so there's nothing
    // to persist here — this action exists so the UI has a real
    // server-verified "skip" path rather than only a client-side redirect.
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to skip this step.");
  }
}

/**
 * Seeds a small set of demo keywords for a brand with no keyword data yet,
 * so onboarding always ends with something to look at in the Keyword
 * Explorer. Uses raw values spanning a realistic range; the priority score
 * is computed by the real scoring function (Phase 5), not hardcoded.
 */
export async function seedDemoKeywords(brandId: string): Promise<ActionResult<{ count: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const existing = await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(eq(keywords.brandId, brandId))
      .limit(1);

    if (existing.length > 0) {
      return { ok: true, data: { count: 0 } };
    }

    const demoTerms: Array<{
      term: string;
      rawVolume: number;
      rawDifficulty: number;
      rawCommercialIntent: number;
      rawTrend: number;
      rawBusinessValue: number;
    }> = [
      { term: "detangling brush for kids", rawVolume: 8100, rawDifficulty: 38, rawCommercialIntent: 0.8, rawTrend: 0.6, rawBusinessValue: 0.9 },
      { term: "best shampoo for tweens", rawVolume: 5400, rawDifficulty: 45, rawCommercialIntent: 0.7, rawTrend: 0.5, rawBusinessValue: 0.8 },
      { term: "sulfate free kids shampoo", rawVolume: 3600, rawDifficulty: 30, rawCommercialIntent: 0.75, rawTrend: 0.4, rawBusinessValue: 0.7 },
      { term: "curly hair routine for girls", rawVolume: 2900, rawDifficulty: 42, rawCommercialIntent: 0.5, rawTrend: 0.65, rawBusinessValue: 0.6 },
      { term: "how to brush out knots", rawVolume: 1800, rawDifficulty: 22, rawCommercialIntent: 0.3, rawTrend: 0.35, rawBusinessValue: 0.4 },
    ];

    await db.insert(keywords).values(
      demoTerms.map((t) => ({
        brandId,
        term: t.term,
        rawVolume: t.rawVolume,
        rawDifficulty: t.rawDifficulty,
        rawCommercialIntent: t.rawCommercialIntent,
        rawTrend: t.rawTrend,
        rawBusinessValue: t.rawBusinessValue,
        source: "demo_seed" as const,
      })),
    );

    revalidatePath("/onboarding");
    return { ok: true, data: { count: demoTerms.length } };
  } catch (err) {
    return toActionError(err, "Failed to seed demo keywords.");
  }
}
