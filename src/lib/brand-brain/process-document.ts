import "server-only";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { brandDocuments, brandDocumentChunks } from "@/db/schema";
import { chunkText } from "@/lib/brand-brain/chunk";
import { embedText } from "@/lib/ai/embeddings";

export type ProcessDocumentResult = {
  chunkCount: number;
  adapter: string;
};

/**
 * Processes a single brand document end-to-end: chunk its raw text,
 * embed each chunk (OpenAI or the deterministic demo adapter, chosen by
 * `embedText`), and persist the chunk rows. Called by the job worker
 * (Phase 12) when it picks up an `embed_brand_document` job; also
 * reusable directly for a synchronous re-index action. Updates the
 * document's status to `chunking` -> `embedding` -> `ready`, or `failed`
 * with the error message on the document row if anything throws.
 *
 * This function issues a raw `INSERT ... embedding` via Drizzle's `sql`
 * template because Drizzle's pgvector column type expects a JS number[]
 * bound as a vector literal, which `postgres-js` doesn't serialize
 * automatically — casting through `sql` with the pgvector text literal
 * format (`[0.1,0.2,...]`) is the documented approach for this driver.
 */
export async function processDocument(brandDocumentId: string): Promise<ProcessDocumentResult> {
  const db = getDb();

  const [doc] = await db
    .select()
    .from(brandDocuments)
    .where(eq(brandDocuments.id, brandDocumentId))
    .limit(1);

  if (!doc) {
    throw new Error(`brand_documents row ${brandDocumentId} not found`);
  }

  if (!doc.rawText || doc.rawText.trim().length === 0) {
    await db
      .update(brandDocuments)
      .set({ status: "failed", error: "No extracted text to index." })
      .where(eq(brandDocuments.id, brandDocumentId));
    throw new Error("No extracted text to index.");
  }

  try {
    await db
      .update(brandDocuments)
      .set({ status: "chunking", error: null })
      .where(eq(brandDocuments.id, brandDocumentId));

    const chunks = chunkText(doc.rawText);

    await db
      .update(brandDocuments)
      .set({ status: "embedding" })
      .where(eq(brandDocuments.id, brandDocumentId));

    // Clear any prior chunks (re-index case).
    await db
      .delete(brandDocumentChunks)
      .where(eq(brandDocumentChunks.brandDocumentId, brandDocumentId));

    let adapter = "demo_hash";
    for (const chunk of chunks) {
      const result = await embedText(chunk.content);
      adapter = result.adapter;
      const vectorLiteral = `[${result.embedding.join(",")}]`;

      await db.insert(brandDocumentChunks).values({
        brandId: doc.brandId,
        brandDocumentId: doc.id,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: sql`${vectorLiteral}::vector`,
        metadata: { adapter: result.adapter, isDemo: result.isDemo },
      });
    }

    await db
      .update(brandDocuments)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(brandDocuments.id, brandDocumentId));

    return { chunkCount: chunks.length, adapter };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while indexing document.";
    await db
      .update(brandDocuments)
      .set({ status: "failed", error: message })
      .where(eq(brandDocuments.id, brandDocumentId));
    throw err;
  }
}
