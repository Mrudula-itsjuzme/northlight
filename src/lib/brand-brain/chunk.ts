export type Chunk = {
  index: number;
  content: string;
};

export const DEFAULT_CHUNK_SIZE = 1000; // characters
export const DEFAULT_CHUNK_OVERLAP = 150; // characters

/**
 * Fixed-size character chunking with overlap, breaking on whitespace near
 * the boundary when possible so words aren't split mid-token. Overlap
 * preserves context across chunk boundaries for retrieval (a fact near the
 * end of chunk N is still findable from chunk N+1's leading overlap).
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP,
): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap must be >= 0 and less than chunkSize");
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    // If we're not at the end of the text, try to break on the last
    // whitespace within the window so we don't split a word in half.
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(" ", end);
      const lastNewline = normalized.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastSpace, lastNewline);
      if (breakPoint > start) {
        end = breakPoint;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ index, content });
      index++;
    }

    if (end >= normalized.length) break;

    const nextStart = end - overlap;
    // Guarantee forward progress even if overlap would otherwise stall us
    // (e.g. a breakPoint very close to `start`).
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
