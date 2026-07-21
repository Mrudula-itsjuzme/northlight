import type { GapReportType } from "@/lib/validation/competitors";

export type GapFinding = {
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
};

export type GapReportResult = {
  type: GapReportType;
  findings: GapFinding[];
  priorityScore: number; // 0-1
};

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random float in [0, 1) derived from a seed string. */
function seededFloat(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

const CONTENT_TOPICS = [
  "buying guides",
  "how-to tutorials",
  "comparison articles",
  "seasonal gift guides",
  "ingredient deep-dives",
];

const SCHEMA_TYPES = ["Product", "FAQPage", "HowTo", "Review", "BreadcrumbList"];

const FAQ_TOPICS = [
  "shipping and returns",
  "product safety",
  "age-appropriateness",
  "ingredient sourcing",
  "usage instructions",
];

const BACKLINK_SOURCES = [
  "parenting blogs",
  "beauty review sites",
  "local news mentions",
  "influencer roundups",
  "retailer partnerships",
];

const AI_CITATION_TOPICS = [
  "\"best products for tweens\" AI Overview answers",
  "ChatGPT product recommendation lists",
  "Perplexity comparison summaries",
  "voice assistant shopping queries",
];

/**
 * Demo (deterministic, non-LLM) competitor gap analysis adapter. Seeded by
 * the brand id + competitor id + report type, so the SAME brand/competitor
 * pair always produces the SAME findings and priority score — this is
 * important for a demo: re-running "Generate gap report" for the same pair
 * doesn't produce different results each time, exactly like a real
 * analysis wouldn't randomly change its answer. NOT a real crawl/analysis
 * of the competitor's actual site — findings are drawn from a fixed topic
 * pool and labeled as such (`generated_by: 'demo_adapter'`,
 * `is_demo: true` on the persisted row). A future real adapter (e.g. an
 * LLM-driven analysis of actually-fetched competitor_pages content) could
 * implement the same return shape and be swapped in behind
 * `generateGapReport`.
 */
export function generateGapReport(
  brandId: string,
  competitorId: string,
  type: GapReportType,
): GapReportResult {
  const seedBase = `${brandId}:${competitorId}:${type}`;

  const topicPoolByType: Record<GapReportType, string[]> = {
    content: CONTENT_TOPICS,
    schema: SCHEMA_TYPES,
    faq: FAQ_TOPICS,
    backlink: BACKLINK_SOURCES,
    ai_citation: AI_CITATION_TOPICS,
  };

  const pool = topicPoolByType[type];
  const findingCount = 2 + Math.floor(seededFloat(`${seedBase}:count`) * 3); // 2-4 findings

  const findings: GapFinding[] = [];
  const usedIndices = new Set<number>();
  for (let i = 0; i < findingCount && usedIndices.size < pool.length; i++) {
    let idx = Math.floor(seededFloat(`${seedBase}:idx:${i}`) * pool.length);
    while (usedIndices.has(idx)) {
      idx = (idx + 1) % pool.length;
    }
    usedIndices.add(idx);

    const severityRoll = seededFloat(`${seedBase}:severity:${i}`);
    const severity: GapFinding["severity"] =
      severityRoll > 0.66 ? "high" : severityRoll > 0.33 ? "medium" : "low";

    findings.push({
      title: describeFinding(type, pool[idx]),
      description: describeDetail(type, pool[idx]),
      severity,
    });
  }

  const severityWeight = { low: 0.2, medium: 0.5, high: 0.9 };
  const avgSeverity =
    findings.reduce((sum, f) => sum + severityWeight[f.severity], 0) / findings.length;
  const priorityScore = Math.round(avgSeverity * 1000) / 1000;

  return { type, findings, priorityScore };
}

function describeFinding(type: GapReportType, topic: string): string {
  switch (type) {
    case "content":
      return `Competitor publishes ${topic} your brand doesn't cover`;
    case "schema":
      return `Competitor uses ${topic} structured data you're missing`;
    case "faq":
      return `Competitor answers "${topic}" questions you don't address`;
    case "backlink":
      return `Competitor has links from ${topic} you lack`;
    case "ai_citation":
      return `Competitor appears more often in ${topic}`;
    default:
      return topic;
  }
}

function describeDetail(type: GapReportType, topic: string): string {
  switch (type) {
    case "content":
      return `Consider producing ${topic} content targeting the same audience segment.`;
    case "schema":
      return `Adding ${topic} markup could improve rich-result eligibility.`;
    case "faq":
      return `Adding an FAQ section covering ${topic} could capture more long-tail search intent.`;
    case "backlink":
      return `Outreach to ${topic} could close this authority gap over time.`;
    case "ai_citation":
      return `This is a directional signal only, not an official citation count — see AI Visibility methodology.`;
    default:
      return topic;
  }
}
