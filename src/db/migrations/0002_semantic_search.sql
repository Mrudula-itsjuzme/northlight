-- Semantic retrieval over brand_document_chunks via pgvector cosine
-- distance. Scoped to a single brand (tenant isolation) and returns the
-- top `match_count` chunks ordered by similarity. SECURITY INVOKER (the
-- default) so RLS on brand_document_chunks still applies to whoever calls
-- this function — it is not a way to bypass tenant isolation.
--
-- NOTE: like the `vector(1536)` column itself, this function cannot be
-- exercised against pglite (see tests/db/pglite.ts's documented deviation
-- — pglite's bundled contrib set has no pgvector extension). It is
-- validated for syntactic correctness only, via
-- tests/integration/migration-syntax.test.ts (libpg-query, real Postgres
-- grammar). The chunking (src/lib/brand-brain/chunk.ts) and embedding
-- adapter (src/lib/ai/embeddings.ts) logic that feeds this function is
-- unit-tested directly instead, per Phase 4's documented scope.
CREATE OR REPLACE FUNCTION public.match_brand_document_chunks(
  p_brand_id uuid,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  brand_document_id uuid,
  chunk_index int,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.brand_document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM brand_document_chunks c
  WHERE c.brand_id = p_brand_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
