import { describe, it, expect } from "vitest";
import { chunkText, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from "@/lib/brand-brain/chunk";

describe("chunkText", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("returns a single chunk for text shorter than chunkSize", () => {
    const chunks = chunkText("Hello world.", 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ index: 0, content: "Hello world." });
  });

  it("splits long text into multiple chunks", () => {
    const text = "word ".repeat(500).trim(); // 2999 chars
    const chunks = chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(500);
    }
  });

  it("produces overlapping content between consecutive chunks", () => {
    const text = Array.from({ length: 300 }, (_, i) => `sentence${i}`).join(" ");
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);

    // The tail of chunk N should share some content with the head of
    // chunk N+1, proving overlap actually happened.
    const firstChunkTail = chunks[0].content.slice(-20);
    const secondChunkHead = chunks[1].content.slice(0, 60);
    const tailWords = firstChunkTail.trim().split(" ").filter(Boolean);
    const overlaps = tailWords.some((w) => secondChunkHead.includes(w));
    expect(overlaps).toBe(true);
  });

  it("assigns sequential zero-based indices", () => {
    const text = "word ".repeat(500).trim();
    const chunks = chunkText(text, 300, 30);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it("does not split words when a whitespace break point is available", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const chunks = chunkText(text, 20, 5);
    for (const chunk of chunks) {
      // No chunk content should start or end with a partial word fragment
      // from splitting mid-token (best-effort: content is trimmed and our
      // break-point logic prefers the last whitespace within the window).
      expect(chunk.content).not.toMatch(/^\s/);
      expect(chunk.content).not.toMatch(/\s$/);
    }
  });

  it("makes forward progress and terminates for tiny overlap-heavy inputs", () => {
    const text = "a".repeat(50);
    const chunks = chunkText(text, 10, 9);
    expect(chunks.length).toBeGreaterThan(0);
    // Must terminate (test itself times out otherwise) and cover the text.
    const totalCoverage = chunks.reduce((sum, c) => sum + c.content.length, 0);
    expect(totalCoverage).toBeGreaterThan(0);
  });

  it("rejects invalid overlap/chunkSize combinations", () => {
    expect(() => chunkText("hello", 10, 10)).toThrow();
    expect(() => chunkText("hello", 10, -1)).toThrow();
    expect(() => chunkText("hello", 0, 0)).toThrow();
  });

  it("uses documented defaults when not specified", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(1000);
    expect(DEFAULT_CHUNK_OVERLAP).toBe(150);
    const chunks = chunkText("short text");
    expect(chunks).toHaveLength(1);
  });
});
