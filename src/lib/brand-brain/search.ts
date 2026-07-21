import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { embedText } from "@/lib/ai/embeddings";

export type SemanticSearchResult = {
  id: string;
  brandDocumentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

/**
 * Semantic retrieval over a brand's indexed document chunks via the
 * `match_brand_document_chunks` Postgres function (migration 0002,
 * pgvector cosine distance). Untested against a real Postgres engine in
 * this sandbox (pglite has no pgvector — see migration 0002's header
 * comment and DATABASE.md), but the embedding-adapter call feeding it is
 * real and the SQL itself is syntax-validated.
 */
export async function searchBrandDocuments(
  brandId: string,
  query: string,
  matchCount = 8,
): Promise<SemanticSearchResult[]> {
  const { embedding } = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;
  const db = getDb();

  const rows = await db.execute<{
    id: string;
    brand_document_id: string;
    chunk_index: number;
    content: string;
    similarity: number;
  }>(
    sql`SELECT * FROM match_brand_document_chunks(${brandId}::uuid, ${vectorLiteral}::vector, ${matchCount})`,
  );

  return rows.map((row) => ({
    id: row.id,
    brandDocumentId: row.brand_document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    similarity: row.similarity,
  }));
}
