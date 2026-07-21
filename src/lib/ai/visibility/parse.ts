import type { Sentiment } from "@/lib/ai/visibility/adapter";

export type ParsedMention = {
  mentioned: boolean;
  position: number | null;
  sentiment: Sentiment;
  confidence: number;
};

const POSITIVE_WORDS = [
  "best",
  "excellent",
  "great",
  "top",
  "recommended",
  "trusted",
  "favorite",
  "loved",
  "outstanding",
];
const NEGATIVE_WORDS = [
  "worst",
  "avoid",
  "poor",
  "disappointing",
  "overpriced",
  "unreliable",
  "complaints",
];

/**
 * Parses raw LLM-style response TEXT (a numbered or prose list of brand
 * recommendations) to extract whether `brandName` was mentioned, its
 * 1-based position if it appeared in a numbered/ordered list, a coarse
 * sentiment classification from nearby positive/negative words, and a
 * confidence score reflecting how certain THIS PARSER is about its own
 * extraction (not a guarantee the underlying LLM "meant" any of this).
 * Shared by both the demo adapter and any real OpenAI-backed adapter, so
 * this parsing logic is unit-tested once and reused for both — see
 * tests/unit/visibility-parse.test.ts for fixture-text-in,
 * expected-mention/position/sentiment/confidence-out cases.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseVisibilityResponse(responseText: string, brandName: string): ParsedMention {
  const lowerText = responseText.toLowerCase();
  const lowerBrand = brandName.toLowerCase();

  // Word-boundary match, not a naive substring search — a naive
  // `indexOf` would incorrectly match "Curl Co" inside "Silkcurl Co",
  // falsely reporting a mention of a brand that never actually appeared.
  // `\b` doesn't fire at a word char, so we anchor on "not a
  // letter/digit" on both sides instead, since brand names can contain
  // spaces (which \b treats as a boundary already, but a leading
  // alphanumeric char directly attached to the brand name, as in
  // "Silkcurl Co", must NOT count as a boundary).
  const mentionMatch = lowerText.match(
    new RegExp(`(?<![a-z0-9])${escapeRegExp(lowerBrand)}(?![a-z0-9])`),
  );
  const mentionIndex = mentionMatch?.index ?? -1;
  const mentioned = mentionIndex !== -1;

  if (!mentioned) {
    return { mentioned: false, position: null, sentiment: "unknown", confidence: 0.9 };
  }

  // Try to find a 1-based numbered-list position: look for the nearest
  // preceding "N." or "N)" pattern before the mention.
  let position: number | null = null;
  const beforeMention = responseText.slice(0, mentionIndex);
  const listMatches = Array.from(beforeMention.matchAll(/(?:^|\n)\s*(\d+)[.)]/g));
  if (listMatches.length > 0) {
    const lastMatch = listMatches[listMatches.length - 1];
    position = Number.parseInt(lastMatch[1], 10);
  }

  // Sentiment: scan a window of text around the mention for positive/
  // negative signal words.
  const windowStart = Math.max(0, mentionIndex - 100);
  const windowEnd = Math.min(lowerText.length, mentionIndex + lowerBrand.length + 100);
  const window = lowerText.slice(windowStart, windowEnd);

  const positiveHits = POSITIVE_WORDS.filter((w) => window.includes(w)).length;
  const negativeHits = NEGATIVE_WORDS.filter((w) => window.includes(w)).length;

  let sentiment: Sentiment = "neutral";
  if (positiveHits > negativeHits) sentiment = "positive";
  else if (negativeHits > positiveHits) sentiment = "negative";

  // Confidence: higher when we found an explicit list position AND a
  // clear (non-tied) sentiment signal; lower when the mention was found
  // but neither position nor sentiment could be determined confidently.
  let confidence = 0.5;
  if (position !== null) confidence += 0.25;
  if (positiveHits !== negativeHits && (positiveHits > 0 || negativeHits > 0)) confidence += 0.25;
  confidence = Math.min(1, confidence);

  return { mentioned: true, position, sentiment, confidence };
}
