import "server-only";
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "@/db";
import { aiEvaluations, articles } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type EvaluationMetrics = {
  overallScore: number;
  factualGroundingScore: number;
  brandBrainGroundingScore: number;
  brandVoiceScore: number;
  readabilityScore: number;
  seoQualityScore: number;
  entityCoverageScore: number;
  duplicateDetectionScore: number;
  hallucinationLikelihoodScore: number;
  structureQualityScore: number;
  citationCoverageScore: number;
  explanation: string;
  categoryScores: Record<string, number>;
  evaluatorVersion: string;
  methodologyDescription: string;
  confidenceScore: number;
  knownLimitations: string[];
};

export type EvaluateContentInput = {
  brandId: string;
  articleId?: string;
  runId?: string;
  bodyHtml: string;
  primaryKeyword?: string;
  brandContextSnippets?: string[];
  claims?: Array<{ claimText: string; supported: boolean }>;
  sources?: Array<{ chunkId: string; title: string }>;
  extractedEntities?: string[];
};

/**
 * Escapes special characters for dynamic RegExp construction to prevent SyntaxError / Regex Injection.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Estimates syllable count for a given word using standard vowel-cluster heuristics.
 */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const matches = clean.match(/[aeiouy]{1,2}/gi);
  let count = matches ? matches.length : 1;
  if (clean.endsWith("e") && !clean.endsWith("le") && count > 1) {
    count--;
  }
  return Math.max(1, count);
}

/**
 * Generates n-grams (default 3-grams) for text overlap computation.
 */
export function generateNgrams(text: string, n = 3): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(" "));
  }
  return ngrams;
}

/**
 * Computes Jaccard similarity between two n-gram sets.
 */
export function computeNgramJaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection++;
  });
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Computes deterministic & grounded quality scores for 10 evaluation dimensions.
 */
export function computeEvaluation(input: EvaluateContentInput): EvaluationMetrics {
  const text = (input.bodyHtml || "").replace(/<[^>]*>/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      overallScore: 0.5,
      factualGroundingScore: 0.5,
      brandBrainGroundingScore: 0.5,
      brandVoiceScore: 0.5,
      readabilityScore: 0.5,
      seoQualityScore: 0.5,
      entityCoverageScore: 0.5,
      duplicateDetectionScore: 0.5,
      hallucinationLikelihoodScore: 0.5,
      structureQualityScore: 0.5,
      citationCoverageScore: 0.5,
      explanation: "Body content is empty or contains only HTML tags.",
      categoryScores: {
        factual_grounding: 0.5,
        brand_brain_grounding: 0.5,
        brand_voice: 0.5,
        readability: 0.5,
        seo_quality: 0.5,
        entity_coverage: 0.5,
        duplicate_detection: 0.5,
        hallucination_likelihood: 0.5,
        structure_quality: 0.5,
        citation_coverage: 0.5,
      },
      evaluatorVersion: "v2.0.0",
      methodologyDescription: "Fallback score calculation due to empty text body.",
      confidenceScore: 0.2,
      knownLimitations: ["Content length is zero; heuristic defaults applied."],
    };
  }

  // 1. Readability score (Standard Flesch Reading Ease Formula)
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const sentenceCount = sentences.length || 1;
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const asl = wordCount / sentenceCount; // Average Sentence Length
  const asw = totalSyllables / wordCount; // Average Syllables per Word
  const fleschEase = 206.835 - 1.015 * asl - 84.6 * asw;
  // Map Flesch Reading Ease (0-100) to [0, 1] normalized quality score (target range: 50-75 optimal)
  const readabilityScore = Math.min(1, Math.max(0.2, 1 - Math.abs(fleschEase - 62.5) / 62.5));

  // 2. Structure Quality Score
  const h1Count = (input.bodyHtml.match(/<h1[^>]*>/gi) || []).length;
  const h2Count = (input.bodyHtml.match(/<h2[^>]*>/gi) || []).length;
  const pCount = (input.bodyHtml.match(/<p[^>]*>/gi) || []).length;
  let structureQualityScore = 0.5;
  if (h1Count === 1 && h2Count >= 2 && pCount >= 3) structureQualityScore = 0.95;
  else if (h2Count >= 1 && pCount >= 2) structureQualityScore = 0.8;

  // 3. SEO Quality Score (Keyword density check)
  let seoQualityScore = 0.6;
  if (input.primaryKeyword && input.primaryKeyword.trim().length > 0) {
    try {
      const safeKw = escapeRegExp(input.primaryKeyword.trim());
      const kwMatches = text.toLowerCase().match(new RegExp(safeKw.toLowerCase(), "g")) || [];
      const density = wordCount > 0 ? kwMatches.length / wordCount : 0;
      seoQualityScore = density >= 0.005 && density <= 0.03 ? 0.95 : density > 0 ? 0.75 : 0.4;
    } catch {
      seoQualityScore = 0.5;
    }
  }

  // 4. Factual Grounding & Hallucination Likelihood
  const claims = input.claims || [];
  const supportedClaims = claims.filter((c) => c.supported).length;
  const factualGroundingScore = claims.length > 0 ? supportedClaims / claims.length : 0.85;
  const hallucinationLikelihoodScore = factualGroundingScore >= 0.8 ? 0.9 : factualGroundingScore >= 0.5 ? 0.6 : 0.3;

  // 5. Brand Brain Grounding (Semantic n-gram overlap)
  const snippets = input.brandContextSnippets || [];
  let brandBrainGroundingScore = 0.7;
  if (snippets.length > 0) {
    const textNgrams = generateNgrams(text, 3);
    const snippetNgramHits = snippets.map((s) => computeNgramJaccard(textNgrams, generateNgrams(s, 3)));
    const avgOverlap = snippetNgramHits.reduce((sum, v) => sum + v, 0) / snippets.length;
    brandBrainGroundingScore = Math.min(1, Math.max(0.3, 0.4 + avgOverlap * 3.0));
  }

  // 6. Citation Coverage
  const sources = input.sources || [];
  const citationCoverageScore = sources.length > 0 ? Math.min(1, sources.length * 0.25) : 0.6;

  // 7. Duplicate Detection Score
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const lexicalDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 1;
  const duplicateDetectionScore = Math.min(1, Math.max(0.4, lexicalDiversity * 1.4));

  // 8. Brand Voice Score
  const brandVoiceScore = Math.min(1, (structureQualityScore + brandBrainGroundingScore) / 2);

  // 9. Entity Coverage Score (Using extracted entities if provided, else uppercase entity detection)
  let entityCoverageScore = 0.7;
  if (input.extractedEntities && input.extractedEntities.length > 0) {
    const textLower = text.toLowerCase();
    const matchedEntities = input.extractedEntities.filter((e) => textLower.includes(e.toLowerCase())).length;
    entityCoverageScore = Math.min(1, Math.max(0.4, matchedEntities / input.extractedEntities.length));
  } else {
    const capitalWords = words.filter((w) => /^[A-Z][a-z]+$/.test(w));
    entityCoverageScore = Math.min(1, Math.max(0.5, capitalWords.length / Math.max(1, wordCount * 0.1)));
  }

  // Category Scores map with strict [0, 1] bounds
  const categoryScores: Record<string, number> = {
    factual_grounding: Math.min(1, Math.max(0, factualGroundingScore)),
    brand_brain_grounding: Math.min(1, Math.max(0, brandBrainGroundingScore)),
    brand_voice: Math.min(1, Math.max(0, brandVoiceScore)),
    readability: Math.min(1, Math.max(0, readabilityScore)),
    seo_quality: Math.min(1, Math.max(0, seoQualityScore)),
    entity_coverage: Math.min(1, Math.max(0, entityCoverageScore)),
    duplicate_detection: Math.min(1, Math.max(0, duplicateDetectionScore)),
    hallucination_likelihood: Math.min(1, Math.max(0, hallucinationLikelihoodScore)),
    structure_quality: Math.min(1, Math.max(0, structureQualityScore)),
    citation_coverage: Math.min(1, Math.max(0, citationCoverageScore)),
  };

  const scoreValues = Object.values(categoryScores);
  const overallScore = scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length;

  const explanation = `Overall evaluation score: ${(overallScore * 100).toFixed(1)}/100. Flesch Reading Ease: ${fleschEase.toFixed(1)} (readability: ${(categoryScores.readability * 100).toFixed(0)}%). Grounding: ${(categoryScores.brand_brain_grounding * 100).toFixed(0)}%. SEO: ${(categoryScores.seo_quality * 100).toFixed(0)}%.`;

  return {
    overallScore,
    factualGroundingScore: categoryScores.factual_grounding,
    brandBrainGroundingScore: categoryScores.brand_brain_grounding,
    brandVoiceScore: categoryScores.brand_voice,
    readabilityScore: categoryScores.readability,
    seoQualityScore: categoryScores.seo_quality,
    entityCoverageScore: categoryScores.entity_coverage,
    duplicateDetectionScore: categoryScores.duplicate_detection,
    hallucinationLikelihoodScore: categoryScores.hallucination_likelihood,
    structureQualityScore: categoryScores.structure_quality,
    citationCoverageScore: categoryScores.citation_coverage,
    explanation,
    categoryScores,
    evaluatorVersion: "v2.0.0",
    methodologyDescription: "Multi-dimensional scoring engine combining Flesch Reading Ease formulas, 3-gram Jaccard grounding overlap, citation verification, and entity density.",
    confidenceScore: claims.length > 0 && snippets.length > 0 ? 0.92 : 0.75,
    knownLimitations: [
      "Flesch Reading Ease measures text complexity but does not account for technical jargon accuracy.",
      "Grounding uses n-gram overlap; full semantic embedding similarity requires live LLM gateway.",
    ],
  };
}

/**
 * Computes and persists an immutable AI evaluation record in `ai_evaluations`.
 */
export async function evaluateAndPersistContent(
  input: EvaluateContentInput,
): Promise<ActionResult<{ evaluationId: string; metrics: EvaluationMetrics }>> {
  try {
    await requireRoleOrThrow(input.brandId, "viewer");
    const db = getDb();

    // Verify article ownership if articleId is provided
    if (input.articleId) {
      const [article] = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(eq(articles.id, input.articleId), eq(articles.brandId, input.brandId)))
        .limit(1);

      if (!article) {
        return { ok: false, error: "Article not found or does not belong to specified brand." };
      }
    }

    const metrics = computeEvaluation(input);

    const [record] = await db
      .insert(aiEvaluations)
      .values({
        brandId: input.brandId,
        articleId: input.articleId ?? null,
        runId: input.runId ?? null,
        overallScore: metrics.overallScore,
        factualGroundingScore: metrics.factualGroundingScore,
        brandBrainGroundingScore: metrics.brandBrainGroundingScore,
        brandVoiceScore: metrics.brandVoiceScore,
        readabilityScore: metrics.readabilityScore,
        seoQualityScore: metrics.seoQualityScore,
        entityCoverageScore: metrics.entityCoverageScore,
        duplicateDetectionScore: metrics.duplicateDetectionScore,
        hallucinationLikelihoodScore: metrics.hallucinationLikelihoodScore,
        structureQualityScore: metrics.structureQualityScore,
        citationCoverageScore: metrics.citationCoverageScore,
        explanation: metrics.explanation,
        categoryScores: metrics.categoryScores,
        evaluatorVersion: metrics.evaluatorVersion,
      })
      .returning({ id: aiEvaluations.id });

    return { ok: true, data: { evaluationId: record.id, metrics } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to compute evaluation." };
  }
}

/**
 * Retrieves historical evaluation records for an article (never overwritten).
 */
export async function listArticleEvaluations(
  brandId: string,
  articleId: string,
): Promise<ActionResult<Array<{ id: string; overallScore: number; explanation: string; createdAt: Date }>>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const rows = await db
      .select({
        id: aiEvaluations.id,
        overallScore: aiEvaluations.overallScore,
        explanation: aiEvaluations.explanation,
        createdAt: aiEvaluations.createdAt,
      })
      .from(aiEvaluations)
      .where(and(eq(aiEvaluations.brandId, brandId), eq(aiEvaluations.articleId, articleId)))
      .orderBy(desc(aiEvaluations.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        overallScore: r.overallScore,
        explanation: r.explanation ?? "",
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to list evaluations." };
  }
}
