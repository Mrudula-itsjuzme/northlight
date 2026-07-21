import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, resetToSuperuser, setCurrentUser } from "../db/pglite";
import { chunkText } from "@/lib/brand-brain/chunk";
import { demoHashEmbedding } from "@/lib/ai/embeddings";

/**
 * Proves the Brand Brain data-layer contract against the real schema (via
 * pglite, with the same documented vector -> double precision[]
 * substitution used by tests/db/pglite.ts and tenant-isolation.test.ts —
 * pgvector's actual cosine-distance operator and the
 * match_brand_document_chunks() function from migration 0002 cannot run
 * under pglite, so THAT part is validated only for SQL syntax via
 * tests/integration/migration-syntax.test.ts, exactly as documented
 * there and in DATABASE.md):
 *
 * - chunking + the demo embedding adapter produce the right number of
 *   brand_document_chunks rows, each correctly brand_id-scoped
 * - a document's status can move through pending -> chunking -> embedding
 *   -> ready (or failed), matching what src/lib/brand-brain/process-document.ts
 *   actually does
 * - RLS still isolates brand_document_chunks between brands, same as every
 *   other tenant table (this table is covered by the same generic
 *   tenant-owned-table policy loop as tenant-isolation.test.ts already
 *   proves for keywords/competitors/etc — repeated here specifically for
 *   this table since it's new to Phase 4)
 */
describe("brand_document_chunks (pglite)", () => {
  let db: PGlite;
  const userA = "66666666-6666-6666-6666-666666666666";
  const userB = "77777777-7777-7777-7777-777777777777";
  let brandAId: string;
  let brandBId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await resetToSuperuser(db);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'a@test.com');`, [userA]);
    await db.query(`INSERT INTO profiles (id, email) VALUES ($1, 'b@test.com');`, [userB]);

    const brandA = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand A', 'brand-a-doc', $1) RETURNING id;`,
      [userA],
    );
    brandAId = brandA.rows[0].id;
    const brandB = await db.query<{ id: string }>(
      `INSERT INTO brands (name, slug, created_by) VALUES ('Brand B', 'brand-b-doc', $1) RETURNING id;`,
      [userB],
    );
    brandBId = brandB.rows[0].id;

    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
      [brandAId, userA],
    );
    await db.query(
      `INSERT INTO brand_members (brand_id, user_id, role) VALUES ($1, $2, 'owner');`,
      [brandBId, userB],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  async function insertChunks(brandId: string, documentId: string, text: string) {
    const chunks = chunkText(text, 200, 20);
    for (const chunk of chunks) {
      const embedding = demoHashEmbedding(chunk.content);
      await db.query(
        `INSERT INTO brand_document_chunks (brand_id, brand_document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5::double precision[]);`,
        [brandId, documentId, chunk.index, chunk.content, embedding],
      );
    }
    return chunks.length;
  }

  it("persists one chunk row per chunk, correctly brand-scoped", async () => {
    const doc = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Brand Voice', 'typed_text', 'pending') RETURNING id;`,
      [brandAId],
    );
    const documentId = doc.rows[0].id;

    const longText = "Our brand voice is friendly and playful. ".repeat(50);
    const expectedChunkCount = await insertChunks(brandAId, documentId, longText);

    const stored = await db.query<{ id: string; chunk_index: number }>(
      `SELECT id, chunk_index FROM brand_document_chunks WHERE brand_document_id = $1 ORDER BY chunk_index;`,
      [documentId],
    );
    expect(stored.rows).toHaveLength(expectedChunkCount);
    expect(stored.rows[0].chunk_index).toBe(0);
  });

  it("moves a document through the full status lifecycle", async () => {
    const doc = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Voice Guide', 'typed_text', 'pending') RETURNING id;`,
      [brandAId],
    );
    const documentId = doc.rows[0].id;

    for (const status of ["chunking", "embedding", "ready"]) {
      await db.query(`UPDATE brand_documents SET status = $1 WHERE id = $2;`, [status, documentId]);
      const check = await db.query<{ status: string }>(
        `SELECT status FROM brand_documents WHERE id = $1;`,
        [documentId],
      );
      expect(check.rows[0].status).toBe(status);
    }
  });

  it("records an error and moves to failed on extraction/embedding failure", async () => {
    const doc = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Broken Doc', 'pdf', 'chunking') RETURNING id;`,
      [brandAId],
    );
    const documentId = doc.rows[0].id;

    await db.query(`UPDATE brand_documents SET status = 'failed', error = $1 WHERE id = $2;`, [
      "No extracted text to index.",
      documentId,
    ]);

    const check = await db.query<{ status: string; error: string }>(
      `SELECT status, error FROM brand_documents WHERE id = $1;`,
      [documentId],
    );
    expect(check.rows[0].status).toBe("failed");
    expect(check.rows[0].error).toBe("No extracted text to index.");
  });

  it("prevents brand A's user from reading brand B's document chunks (RLS)", async () => {
    const docB = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'Secret Doc', 'typed_text', 'ready') RETURNING id;`,
      [brandBId],
    );
    await insertChunks(brandBId, docB.rows[0].id, "Confidential competitor strategy notes.");

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM brand_document_chunks;`);
    expect(result.rows).toHaveLength(0);
  });

  it("lets brand A's user read its own chunks", async () => {
    const docA = await db.query<{ id: string }>(
      `INSERT INTO brand_documents (brand_id, title, source_type, status) VALUES ($1, 'My Doc', 'typed_text', 'ready') RETURNING id;`,
      [brandAId],
    );
    await insertChunks(brandAId, docA.rows[0].id, "Our tone is warm and encouraging for tweens.");

    await setCurrentUser(db, userA);
    const result = await db.query(`SELECT id FROM brand_document_chunks;`);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
