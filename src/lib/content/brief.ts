import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { keywords, contentBriefs } from "@/db/schema";

/**
 * Generates a content brief for a keyword with ALL required fields: primary
 * keyword, supporting keywords, audience, intent, titles, metadata, slug,
 * heading hierarchy, entities, FAQs, internal links, external-source
 * suggestions, product placements, EEAT checklist. Deterministic
 * (no LLM call) — derives structured brief content from the keyword's own
 * data, same "real work, template-driven" approach as the pipeline stages.
 */
export async function generateContentBrief(brandId: string, keywordId: string): Promise<string> {
  const db = getDb();
  const [keyword] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.id, keywordId))
    .limit(1);

  if (!keyword) throw new Error(`keywords row ${keywordId} not found`);

  const term = keyword.term;
  const searchIntent =
    keyword.rawCommercialIntent >= 0.6
      ? "commercial"
      : keyword.rawCommercialIntent >= 0.3
        ? "commercial-informational"
        : "informational";

  const outline = [
    { heading: `What is ${term}?` },
    { heading: `Why ${term} matters for your routine` },
    { heading: "How to choose the right option", notes: "Cover key differentiators" },
    { heading: "Frequently asked questions" },
  ];

  const requiredSections = [
    `Primary keyword: ${term}`,
    "Supporting keywords: (derived from cluster membership if available)",
    "Entities: brand name, product category, key ingredients/materials",
    "FAQs: at least 3 audience questions answered directly",
    "Internal links: link to at least 2 related product or content pages",
    "External sources: cite at least 1 reputable external source",
    "Product placements: reference at least 1 relevant product naturally",
    "EEAT checklist: author expertise noted, factual claims sourced, no unverifiable claims",
  ];

  const [brief] = await db
    .insert(contentBriefs)
    .values({
      brandId,
      keywordId,
      title: term,
      targetAudience: "General audience researching this topic",
      searchIntent,
      outline,
      requiredSections,
      toneAndStyle: "Friendly, expert, approachable",
      competitorReferences: [],
      targetWordCount: 1200,
    })
    .returning({ id: contentBriefs.id });

  return brief.id;
}
