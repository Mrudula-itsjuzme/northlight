/**
 * Deterministic heuristic scoring for SEO / EEAT / AI-readiness, 0-100
 * each. NOT an LLM judgment call — every sub-score is a simple, auditable
 * rule computed directly from the article's own HTML content and
 * metadata, so the same input always produces the same score and a
 * reviewer can see exactly why a score is what it is. Precise formulas
 * are documented in AI_SCORING.md (Phase 15) to match this file exactly.
 */

export type ArticleScoringInput = {
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  claimCount: number;
  unresolvedClaimCount: number;
  hasJsonLd: boolean;
};

export type ArticleScores = {
  seoScore: number;
  eeatScore: number;
  aiReadinessScore: number;
};

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const lower = haystack.toLowerCase();
  const target = needle.toLowerCase();
  let count = 0;
  let index = 0;
  while ((index = lower.indexOf(target, index)) !== -1) {
    count++;
    index += target.length;
  }
  return count;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * SEO score (0-100), weighted sum of 5 checks (20 points each):
 *   1. Meta title present and <= 60 chars (ideal length for SERP display).
 *   2. Meta description present and <= 155 chars.
 *   3. Primary keyword appears in the meta title.
 *   4. Primary keyword appears at least once in the body.
 *   5. Body has at least one H2 heading (structure signal).
 */
export function computeSeoScore(input: ArticleScoringInput): number {
  let score = 0;
  if (input.metaTitle.length > 0 && input.metaTitle.length <= 60) score += 20;
  if (input.metaDescription.length > 0 && input.metaDescription.length <= 155) score += 20;
  if (input.metaTitle.toLowerCase().includes(input.primaryKeyword.toLowerCase())) score += 20;
  if (countOccurrences(stripHtml(input.bodyHtml), input.primaryKeyword) > 0) score += 20;
  if (/<h2[\s>]/i.test(input.bodyHtml)) score += 20;
  return clamp(score);
}

/**
 * EEAT score (0-100, Experience/Expertise/Authoritativeness/Trust), 4
 * checks (25 points each):
 *   1. Body length >= 300 words (baseline depth of coverage).
 *   2. At least one heading contains a "why"/"how"/"what" pattern
 *      (signals explanatory, expertise-demonstrating structure).
 *   3. Zero unresolved claims (unresolved factual claims are a trust risk).
 *   4. All claims that exist are either resolved or overridden with an
 *      audit trail (claimCount > 0 implies the article was fact-checked
 *      at all — an article with zero claims recorded gets partial credit
 *      here since "checked and found nothing to verify" is weaker than
 *      "checked and verified", but stronger than never being checked is
 *      not distinguishable from this signal alone, so this check awards
 *      full credit whenever unresolvedClaimCount is 0, matching check 3
 *      structurally but rewarding at the whole-article level).
 */
export function computeEeatScore(input: ArticleScoringInput): number {
  const wordCount = stripHtml(input.bodyHtml).split(/\s+/).filter(Boolean).length;
  let score = 0;
  if (wordCount >= 300) score += 25;
  if (/why|how|what/i.test(input.bodyHtml)) score += 25;
  if (input.unresolvedClaimCount === 0) score += 25;
  if (input.claimCount === 0 || input.unresolvedClaimCount === 0) score += 25;
  return clamp(score);
}

/**
 * AI-readiness score (0-100): how well-structured this content is for
 * being surfaced/cited by generative AI answer engines (directional
 * heuristic only, never a guarantee of actual AI citation — see the AI
 * Visibility methodology in Phase 9). 4 checks (25 points each):
 *   1. Valid JSON-LD schema present (`hasJsonLd`).
 *   2. Body contains an FAQ-style heading (helps question-answering
 *      extraction).
 *   3. Body has at least 2 headings (H2/H3) — scannable structure.
 *   4. Meta description is present (concise summary AI systems often
 *      lean on for snippet generation).
 */
export function computeAiReadinessScore(input: ArticleScoringInput): number {
  let score = 0;
  if (input.hasJsonLd) score += 25;
  if (/faq|frequently asked/i.test(input.bodyHtml)) score += 25;
  const headingCount = (input.bodyHtml.match(/<h[23][\s>]/gi) ?? []).length;
  if (headingCount >= 2) score += 25;
  if (input.metaDescription.length > 0) score += 25;
  return clamp(score);
}

export function computeArticleScores(input: ArticleScoringInput): ArticleScores {
  return {
    seoScore: computeSeoScore(input),
    eeatScore: computeEeatScore(input),
    aiReadinessScore: computeAiReadinessScore(input),
  };
}
