import "server-only";

export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingAdapterName = "openai" | "demo_hash";

export type EmbeddingResult = {
  embedding: number[];
  adapter: EmbeddingAdapterName;
  isDemo: boolean;
};

function fnv1a(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // unsigned 32-bit
}

/**
 * Deterministic hash-based embedding used when no OPENAI_API_KEY is
 * configured. NOT a real semantic embedding — cosine similarity between
 * two demo embeddings reflects lexical (word/character n-gram) overlap,
 * not meaning. It exists so the rest of the app (chunk storage, retrieval
 * SQL, UI) can run end-to-end without a real provider, clearly labeled
 * `is_demo=true` everywhere it's used. Deterministic: the same input text
 * always produces the same vector, so tests and demo data are
 * reproducible.
 *
 * Method: the standard "hashing trick" (feature hashing) for bag-of-
 * features vectors. Extract features (lowercased words plus character
 * trigrams of the normalized text), hash each feature to a dimension index
 * in [0, 1536) plus a sign bit from a second independent hash, and
 * accumulate +1/-1 into that dimension for every feature occurrence.
 * L2-normalize the result. Because two texts that share features
 * necessarily add into the SAME dimensions with the SAME signs (the hash
 * of a given feature string is fixed), overlapping text reliably produces
 * higher cosine similarity than unrelated text — unlike re-hashing the
 * whole document per output dimension, which would not correlate shared
 * substrings across two different texts. Precise method documented in
 * AI_SCORING.md.
 */
export function demoHashEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  const features: string[] = [];
  const words = normalized.split(" ").filter(Boolean);
  for (const word of words) features.push(`w:${word}`);

  const padded = `  ${normalized}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    features.push(`t:${padded.slice(i, i + 3)}`);
  }

  if (features.length === 0) features.push("w:__empty__");

  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const feature of features) {
    const dim = fnv1a(feature, 2166136261) % EMBEDDING_DIMENSIONS;
    const sign = fnv1a(feature, 84696351) % 2 === 0 ? 1 : -1;
    vector[dim] += sign;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);

  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

async function openAiEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding response shape from OpenAI (expected ${EMBEDDING_DIMENSIONS} dimensions).`,
    );
  }

  return embedding;
}

/**
 * Produces a 1536-dim embedding for `text`. Uses the real OpenAI API when
 * `OPENAI_API_KEY` is configured; otherwise falls back to the deterministic
 * demo hash embedding. Both paths always return exactly
 * `EMBEDDING_DIMENSIONS` numbers so `brand_document_chunks.embedding
 * vector(1536)` never has to branch on which adapter produced a row. Never
 * silently calls a real provider without a configured key, and never fakes
 * a "success" response if the OpenAI call fails — errors propagate to the
 * caller (the job worker), which records them on the job row.
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  if (process.env.OPENAI_API_KEY) {
    const embedding = await openAiEmbedding(text);
    return { embedding, adapter: "openai", isDemo: false };
  }

  return { embedding: demoHashEmbedding(text), adapter: "demo_hash", isDemo: true };
}

/** Cosine similarity between two equal-length vectors, in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length to compute cosine similarity.");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
