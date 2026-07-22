import "server-only";
import type { GapReportType } from "@/lib/validation/competitors";
import type { GapFinding, GapReportResult } from "@/lib/competitors/gap-analysis";
import type { PageSignals } from "@/lib/competitors/fetch-adapter";

/**
 * Turns real, fetched page signals (`PageSignals`, from
 * `fetch-adapter.ts`) into the same `GapReportResult` shape the
 * deterministic demo adapter produces (`gap-analysis.ts`), so both can sit
 * behind one interface. Unlike the demo adapter, findings here are derived
 * from what was actually observed on the competitor's page — heading
 * structure, JSON-LD schema types present, FAQ-pattern detection, word
 * count, internal link count — not a seeded random topic pool.
 *
 * Only 3 of the 5 gap report types can be meaningfully derived from a
 * single fetched page with cheerio (no crawling multiple pages, no
 * backlink index, no AI-citation data source): `schema`, `faq`, and
 * `content` (using heading structure + word count as a content-depth
 * proxy). `backlink` and `ai_citation` require data sources this
 * lightweight adapter does not have access to (a backlink index, live AI
 * assistant queries) and always fall back to the deterministic demo
 * adapter for those two types — this is a deliberate scope boundary, not a
 * bug: see `generateGapReportsForCompetitor` in `actions.ts`.
 */
export const REAL_ANALYSIS_SUPPORTED_TYPES: readonly GapReportType[] = ["content", "schema", "faq"];

export function isRealAnalysisSupported(type: GapReportType): boolean {
  return REAL_ANALYSIS_SUPPORTED_TYPES.includes(type);
}

function schemaFindings(signals: PageSignals): GapFinding[] {
  const findings: GapFinding[] = [];
  if (signals.jsonLdTypes.length === 0) {
    findings.push({
      title: "Competitor page has no JSON-LD structured data",
      description:
        "No JSON-LD schema was found on this page. This is a neutral/positive finding for you (no schema gap to close here) but is recorded for completeness.",
      severity: "low",
    });
  } else {
    for (const type of signals.jsonLdTypes) {
      findings.push({
        title: `Competitor uses ${type} structured data`,
        description: `The page declares "${type}" JSON-LD schema. Adding matching structured data could improve your own rich-result eligibility for comparable pages.`,
        severity: signals.jsonLdTypes.length > 2 ? "high" : "medium",
      });
    }
  }
  return findings;
}

function faqFindings(signals: PageSignals): GapFinding[] {
  if (!signals.hasFaqPattern) {
    return [
      {
        title: "Competitor page has no detected FAQ pattern",
        description:
          "No FAQPage schema or repeated question-shaped headings were found on this page.",
        severity: "low",
      },
    ];
  }
  return [
    {
      title: "Competitor page has an FAQ-shaped content section",
      description:
        "Detected either FAQPage JSON-LD schema or multiple question-shaped headings, indicating the competitor addresses common questions directly on-page — a pattern that can also improve AI-assistant answer eligibility.",
      severity: "high",
    },
  ];
}

function contentFindings(signals: PageSignals): GapFinding[] {
  const findings: GapFinding[] = [];
  const { h1, h2, h3 } = signals.headingCounts;

  if (h1 !== 1) {
    findings.push({
      title: h1 === 0 ? "Competitor page is missing an H1" : "Competitor page has multiple H1s",
      description: `Found ${h1} H1 heading(s). Exactly one H1 is the typical best practice; this is recorded as an observation, not necessarily a gap in your favor.`,
      severity: "low",
    });
  }

  if (signals.wordCount > 1500) {
    findings.push({
      title: "Competitor page is long-form, in-depth content",
      description: `Approx. ${signals.wordCount} words with ${h2 + h3} sub-headings — a depth of coverage your equivalent page may want to match.`,
      severity: "high",
    });
  } else if (signals.wordCount > 600) {
    findings.push({
      title: "Competitor page is moderate-depth content",
      description: `Approx. ${signals.wordCount} words with ${h2 + h3} sub-headings.`,
      severity: "medium",
    });
  }

  if (signals.internalLinkCount > 20) {
    findings.push({
      title: "Competitor page is heavily internally linked",
      description: `${signals.internalLinkCount} internal links found — suggests this page is a hub in their site architecture (e.g. a pillar/guide page).`,
      severity: "medium",
    });
  }

  if (findings.length === 0) {
    findings.push({
      title: "No significant content-depth gap detected",
      description: `Approx. ${signals.wordCount} words, standard heading structure (${h1} H1, ${h2} H2, ${h3} H3).`,
      severity: "low",
    });
  }

  return findings;
}

const severityWeight = { low: 0.2, medium: 0.5, high: 0.9 } as const;

function toPriorityScore(findings: GapFinding[]): number {
  if (findings.length === 0) return 0;
  const avg = findings.reduce((sum, f) => sum + severityWeight[f.severity], 0) / findings.length;
  return Math.round(avg * 1000) / 1000;
}

/**
 * Builds a real (non-demo) gap report for one supported type from actually
 * fetched page signals. Callers must check `isRealAnalysisSupported(type)`
 * first — this throws for unsupported types rather than silently
 * returning a degraded result, so a caller can never accidentally persist
 * a "real" backlink/ai_citation report that was never actually analyzed.
 */
export function analyzeRealPageSignals(signals: PageSignals, type: GapReportType): GapReportResult {
  if (!isRealAnalysisSupported(type)) {
    throw new Error(`Real analysis does not support gap report type: ${type}`);
  }

  const findings =
    type === "schema" ? schemaFindings(signals) : type === "faq" ? faqFindings(signals) : contentFindings(signals);

  return { type, findings, priorityScore: toPriorityScore(findings) };
}
