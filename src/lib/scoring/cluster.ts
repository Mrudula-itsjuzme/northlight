const STOPWORDS = new Set([
  "a", "an", "the", "for", "of", "to", "in", "on", "and", "or", "with",
  "is", "are", "how", "what", "best", "vs", "your", "you", "my",
]);

function significantTokens(term: string): Set<string> {
  return new Set(
    term
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type ClusterableKeyword = {
  id: string;
  term: string;
};

export type KeywordCluster = {
  name: string;
  keywordIds: string[];
};

/**
 * Deterministic keyword clustering heuristic — no ML/embedding model
 * involved. Groups keywords by shared "significant" tokens (lowercased,
 * stopwords removed, tokens of length > 2) using greedy single-link
 * clustering: process keywords in input order, and for each unclustered
 * keyword either join the first existing cluster whose token set has
 * Jaccard similarity >= `threshold` with it, or start a new cluster.
 * Deterministic and reproducible for the same input in the same order —
 * no randomness, no external model call. A cluster's name is its longest
 * member term (a reasonable representative label without inventing new
 * text).
 */
export function clusterKeywords(
  keywords: ClusterableKeyword[],
  threshold = 0.2,
): KeywordCluster[] {
  const tokensById = new Map<string, Set<string>>();
  for (const kw of keywords) {
    tokensById.set(kw.id, significantTokens(kw.term));
  }

  const clusters: Array<{ keywordIds: string[]; tokens: Set<string> }> = [];

  for (const kw of keywords) {
    const kwTokens = tokensById.get(kw.id)!;

    let bestCluster: (typeof clusters)[number] | null = null;
    let bestSimilarity = 0;
    for (const cluster of clusters) {
      const similarity = jaccardSimilarity(kwTokens, cluster.tokens);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestSimilarity >= threshold) {
      bestCluster.keywordIds.push(kw.id);
      for (const token of Array.from(kwTokens)) bestCluster.tokens.add(token);
    } else {
      clusters.push({ keywordIds: [kw.id], tokens: new Set(kwTokens) });
    }
  }

  const termById = new Map(keywords.map((kw) => [kw.id, kw.term]));

  return clusters.map((cluster) => {
    const name = cluster.keywordIds
      .map((id) => termById.get(id) ?? "")
      .reduce((longest, term) => (term.length > longest.length ? term : longest), "");
    return { name, keywordIds: cluster.keywordIds };
  });
}
