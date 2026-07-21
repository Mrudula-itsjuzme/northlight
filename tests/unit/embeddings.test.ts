import { describe, it, expect } from "vitest";
import {
  demoHashEmbedding,
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
} from "@/lib/ai/embeddings";

describe("demoHashEmbedding", () => {
  it("produces a vector with exactly EMBEDDING_DIMENSIONS entries", () => {
    const vector = demoHashEmbedding("tween haircare detangling brush");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector).toHaveLength(1536);
  });

  it("is deterministic: same input always produces the same vector", () => {
    const a = demoHashEmbedding("sulfate free shampoo for kids");
    const b = demoHashEmbedding("sulfate free shampoo for kids");
    expect(a).toEqual(b);
  });

  it("produces different vectors for different input", () => {
    const a = demoHashEmbedding("detangling brush");
    const b = demoHashEmbedding("competitor analysis report");
    expect(a).not.toEqual(b);
  });

  it("is case- and whitespace-insensitive (normalizes before hashing)", () => {
    const a = demoHashEmbedding("Tween  Haircare");
    const b = demoHashEmbedding("tween haircare");
    expect(a).toEqual(b);
  });

  it("produces values within [-1, 1]", () => {
    const vector = demoHashEmbedding("some brand document text");
    for (const value of vector) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("handles empty string without throwing", () => {
    expect(() => demoHashEmbedding("")).not.toThrow();
    expect(demoHashEmbedding("")).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("gives near-identical text a higher cosine similarity than unrelated text", () => {
    const base = demoHashEmbedding("detangling brush for curly hair kids");
    const similar = demoHashEmbedding("detangling brush for curly hair children");
    const unrelated = demoHashEmbedding("quarterly financial earnings report");

    const simToSimilar = cosineSimilarity(base, similar);
    const simToUnrelated = cosineSimilarity(base, unrelated);

    expect(simToSimilar).toBeGreaterThan(simToUnrelated);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it("throws on mismatched lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it("returns 0 for a zero vector rather than NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
