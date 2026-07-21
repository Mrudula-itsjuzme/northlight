"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { brandDocuments, jobs, brandDocumentChunks } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  extractText,
  sourceTypeFromFilename,
  type ExtractableSourceType,
} from "@/lib/brand-brain/extract-text";
import type { ActionResult } from "@/lib/brands/types";
import {
  BRAND_DOCUMENTS_STORAGE_BUCKET,
  type BrandDocumentSummary,
} from "@/lib/brand-brain/types";

export type { BrandDocumentSummary };

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/**
 * Uploads a brand document file (TXT/CSV/PDF/DOCX). Extracts text
 * server-side immediately (so the raw_text column is always populated for
 * chunking, regardless of storage availability), uploads the original
 * bytes to Supabase Storage when configured, and enqueues an
 * `embed_brand_document` job. If Supabase Storage isn't configured (no
 * live project in this sandbox), the document is still fully usable —
 * `storagePath` stays null and only the extracted text is kept, which is
 * all chunking/embedding needs; this fallback is documented rather than
 * silently failing the whole upload.
 */
export async function uploadBrandDocument(
  brandId: string,
  filename: string,
  fileBuffer: Buffer,
): Promise<ActionResult<{ documentId: string }>> {
  const sourceType = sourceTypeFromFilename(filename);
  if (!sourceType) {
    return {
      ok: false,
      error: "Unsupported file type. Please upload a .txt, .csv, .pdf, or .docx file.",
    };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");

    const text = await extractText(sourceType as ExtractableSourceType, fileBuffer);
    if (!text || text.trim().length === 0) {
      return { ok: false, error: "No text could be extracted from this file." };
    }

    let storagePath: string | null = null;
    try {
      const serviceClient = createServiceRoleClient();
      const path = `${brandId}/${Date.now()}-${filename}`;
      const { error: uploadError } = await serviceClient.storage
        .from(BRAND_DOCUMENTS_STORAGE_BUCKET)
        .upload(path, fileBuffer, { contentType: undefined, upsert: false });
      if (!uploadError) {
        storagePath = path;
      }
    } catch {
      // Supabase not configured in this environment (no live project) —
      // documented local fallback: proceed with extracted text only, no
      // storage path. Chunking/embedding still works from raw_text.
      storagePath = null;
    }

    const db = getDb();
    const documentId = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(brandDocuments)
        .values({
          brandId,
          title: filename,
          sourceType: sourceType as ExtractableSourceType,
          storagePath,
          rawText: text,
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

    revalidatePath("/brand-brain");
    return { ok: true, data: { documentId } };
  } catch (err) {
    return toActionError(err, "Failed to upload document.");
  }
}

export async function listBrandDocuments(
  brandId: string,
): Promise<ActionResult<BrandDocumentSummary[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const docs = await db
      .select()
      .from(brandDocuments)
      .where(eq(brandDocuments.brandId, brandId))
      .orderBy(desc(brandDocuments.createdAt));

    const summaries: BrandDocumentSummary[] = [];
    for (const doc of docs) {
      const chunks = await db
        .select({ id: brandDocumentChunks.id })
        .from(brandDocumentChunks)
        .where(eq(brandDocumentChunks.brandDocumentId, doc.id));
      summaries.push({
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        status: doc.status,
        error: doc.error,
        chunkCount: chunks.length,
        createdAt: doc.createdAt,
      });
    }

    return { ok: true, data: summaries };
  } catch (err) {
    return toActionError(err, "Failed to list brand documents.");
  }
}

/** Deletes a brand document and its chunks (cascade via FK). Editor+. */
export async function deleteBrandDocument(
  brandId: string,
  documentId: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .delete(brandDocuments)
      .where(and(eq(brandDocuments.id, documentId), eq(brandDocuments.brandId, brandId)));

    revalidatePath("/brand-brain");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to delete document.");
  }
}

/** Re-queues a document for chunking/embedding (e.g. after it previously failed). */
export async function reindexBrandDocument(
  brandId: string,
  documentId: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const [doc] = await db
      .select({ id: brandDocuments.id })
      .from(brandDocuments)
      .where(and(eq(brandDocuments.id, documentId), eq(brandDocuments.brandId, brandId)))
      .limit(1);

    if (!doc) {
      return { ok: false, error: "Document not found." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(brandDocuments)
        .set({ status: "pending", error: null })
        .where(eq(brandDocuments.id, documentId));

      await tx.insert(jobs).values({
        brandId,
        type: "embed_brand_document",
        payload: { brandDocumentId: documentId },
      });
    });

    revalidatePath("/brand-brain");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to re-index document.");
  }
}
