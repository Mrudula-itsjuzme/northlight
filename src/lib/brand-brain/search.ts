import "server-only";
import { sql, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";
import { brandDocumentChunks, brandDocuments } from "@/db/schema";

export type SemanticSearchResult = {
  id: string;
  brandDocumentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

/**
 * Semantic retrieval over a brand's indexed document chunks. Uses the
 * `match_brand_document_chunks` Postgres function (pgvector) when available,
 * falling back to in-memory cosine ranking over `brand_document_chunks` in pglite/test
 * environments.
 */
export async function searchBrandDocuments(
  brandId: string,
  query: string,
  matchCount = 5,
): Promise<SemanticSearchResult[]> {
  const { embedding } = await embedText(query);
  const db = getDb();

  try {
    const vectorLiteral = `[${embedding.join(",")}]`;
    const rows = await db.execute<{
      id: string;
      brand_document_id: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }>(
      sql`SELECT * FROM match_brand_document_chunks(${brandId}::uuid, ${vectorLiteral}::vector, ${matchCount})`,
    );

    const results: SemanticSearchResult[] = [];
    for (const row of rows) {
      const [doc] = await db
        .select({ title: brandDocuments.title })
        .from(brandDocuments)
        .where(eq(brandDocuments.id, row.brand_document_id))
        .limit(1);

      results.push({
        id: row.id,
        brandDocumentId: row.brand_document_id,
        documentTitle: doc?.title ?? "Brand Document",
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: Number(row.similarity),
      });
    }
    return results;
  } catch {
    // Fallback for test / pglite environment where pgvector is not loaded
    const docs = await db
      .select({ id: brandDocuments.id, title: brandDocuments.title })
      .from(brandDocuments)
      .where(eq(brandDocuments.brandId, brandId));

    if (docs.length === 0) return [];

    const docMap = new Map(docs.map((d) => [d.id, d.title]));
    const docIds = docs.map((d) => d.id);

    const chunks = await db
      .select()
      .from(brandDocumentChunks)
      .where(sql`${brandDocumentChunks.brandDocumentId} IN ${docIds}`);

    const scored = chunks.map((chunk) => {
      let sim = 0;
      if (chunk.embedding && Array.isArray(chunk.embedding)) {
        sim = cosineSimilarity(embedding, chunk.embedding);
      } else {
        // Lexical similarity fallback
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const matchCount = words.filter((w) => chunk.content.toLowerCase().includes(w)).length;
        sim = words.length > 0 ? matchCount / words.length : 0;
      }

      return {
        id: chunk.id,
        brandDocumentId: chunk.brandDocumentId,
        documentTitle: docMap.get(chunk.brandDocumentId) ?? "Brand Document",
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        similarity: sim,
      };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount);
  }
}
