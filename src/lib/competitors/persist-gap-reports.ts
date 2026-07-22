import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { competitors, competitorPages, gapReports } from "@/db/schema";
import { gapReportTypes, type GapReportType } from "@/lib/validation/competitors";
import { generateGapReport, type GapReportResult } from "@/lib/competitors/gap-analysis";
import { fetchCompetitorPage, type FetchAdapterFailureReason } from "@/lib/competitors/fetch-adapter";
import { analyzeRealPageSignals, isRealAnalysisSupported } from "@/lib/competitors/real-analysis";

/**
 * Role-free core: generates and persists all 5 gap report types for one
 * competitor using ONLY the deterministic demo adapter — never makes an
 * outbound network call. Split out of the `"use server"` action
 * (generateGapReportsForCompetitor in actions.ts) so it can also be
 * called directly by the background job worker (Phase 12,
 * `generate_gap_report` job type) and by `scripts/seed.ts` for the seeded
 * demo brand, which runs outside an authenticated request context and
 * therefore cannot go through `requireRoleOrThrow`'s cookie-based session
 * lookup. The worker itself is the trusted actor picking up
 * already-authorized queued work (the job row was only ever queued by a
 * request that DID pass the role gate), matching the same core/action
 * split already used by runPipeline, generateContentBrief, and
 * processDocument.
 *
 * IMPORTANT: this function is intentionally the ONLY entry point
 * `scripts/seed.ts` calls, and it never imports `fetch-adapter.ts` — the
 * seeded demo brand must never make real outbound network calls. Real
 * fetching only happens via `persistGapReportsForCompetitorWithRealFetch`
 * below, which the interactive server action calls for non-demo brands.
 */
export async function persistGapReportsForCompetitor(
  brandId: string,
  competitorId: string,
): Promise<{ reportCount: number }> {
  const db = getDb();

  const [competitor] = await db
    .select({ id: competitors.id })
    .from(competitors)
    .where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
    .limit(1);

  if (!competitor) {
    throw new Error(`competitors row ${competitorId} not found for brand ${brandId}`);
  }

  const reports = gapReportTypes.map((type) => generateGapReport(brandId, competitorId, type));

  await db.insert(gapReports).values(
    reports.map((report) => ({
      brandId,
      competitorId,
      type: report.type,
      findings: { items: report.findings },
      priorityScore: report.priorityScore,
      isDemo: true,
      generatedBy: "demo_adapter",
    })),
  );

  return { reportCount: reports.length };
}

export type RealFetchOutcome = {
  reportCount: number;
  /** How many of the 5 report types were produced via the real fetch adapter vs. the deterministic fallback. */
  realCount: number;
  fallbackCount: number;
  /** Present only when at least one type fell back; the reason for the first fallback encountered. */
  fallbackReason?: FetchAdapterFailureReason;
};

/**
 * Generates and persists all 5 gap report types for one competitor,
 * attempting the REAL fetch+parse adapter first (see `fetch-adapter.ts`)
 * for the 3 gap types it supports (`content`, `schema`, `faq` — see
 * `real-analysis.ts` for why `backlink`/`ai_citation` are excluded), using
 * the competitor's most recently added page URL. On ANY failure (no page
 * URL on file, robots.txt disallow, timeout, non-2xx, non-HTML content
 * type, oversized response, or a real-analysis-unsupported type), falls
 * back to the deterministic demo adapter for that type and records the
 * fallback reason in the persisted row's `findings.fallbackReason` field
 * (and `generatedBy: "demo_adapter_fallback"` so it's distinguishable from
 * a report that was always demo-only).
 *
 * Callers MUST NOT use this for the seeded demo brand — see
 * `generateGapReportsForCompetitor` in `actions.ts`, which gates on
 * `isBrandDemo` before ever calling this function.
 */
export async function persistGapReportsForCompetitorWithRealFetch(
  brandId: string,
  competitorId: string,
): Promise<RealFetchOutcome> {
  const db = getDb();

  const [competitor] = await db
    .select({ id: competitors.id })
    .from(competitors)
    .where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
    .limit(1);

  if (!competitor) {
    throw new Error(`competitors row ${competitorId} not found for brand ${brandId}`);
  }

  const [page] = await db
    .select({ url: competitorPages.url })
    .from(competitorPages)
    .where(and(eq(competitorPages.competitorId, competitorId), eq(competitorPages.brandId, brandId)))
    .orderBy(desc(competitorPages.createdAt))
    .limit(1);

  // Fetch the page once (if we have a URL at all) and reuse the same
  // signals across all real-analysis-supported types, rather than
  // re-fetching per type.
  const fetchResult = page ? await fetchCompetitorPage(page.url) : null;
  const firstFailureReason: FetchAdapterFailureReason | undefined =
    !page ? "invalid_url" : fetchResult && !fetchResult.ok ? fetchResult.reason : undefined;

  let realCount = 0;
  let fallbackCount = 0;
  let recordedFallbackReason: FetchAdapterFailureReason | undefined;

  const rows: Array<{
    brandId: string;
    competitorId: string;
    type: GapReportType;
    findings: Record<string, unknown>;
    priorityScore: number | null;
    isDemo: boolean;
    generatedBy: string;
  }> = [];

  for (const type of gapReportTypes) {
    let real: GapReportResult | null = null;

    if (isRealAnalysisSupported(type) && fetchResult && fetchResult.ok) {
      try {
        real = analyzeRealPageSignals(fetchResult.signals, type);
      } catch {
        real = null;
      }
    }

    if (real) {
      realCount++;
      rows.push({
        brandId,
        competitorId,
        type,
        findings: { items: real.findings },
        priorityScore: real.priorityScore,
        isDemo: false,
        generatedBy: "real_fetch",
      });
    } else {
      fallbackCount++;
      const reason: FetchAdapterFailureReason = isRealAnalysisSupported(type)
        ? (firstFailureReason ?? "network_error")
        : "invalid_url"; // backlink/ai_citation are never real-analysis-supported; not a "failure" but recorded consistently
      if (!recordedFallbackReason) recordedFallbackReason = reason;

      const demo = generateGapReport(brandId, competitorId, type);
      rows.push({
        brandId,
        competitorId,
        type,
        findings: {
          items: demo.findings,
          fallbackReason: isRealAnalysisSupported(type) ? reason : "unsupported_report_type",
        },
        priorityScore: demo.priorityScore,
        isDemo: true,
        generatedBy: "demo_adapter_fallback",
      });
    }
  }

  await db.insert(gapReports).values(rows);

  return {
    reportCount: rows.length,
    realCount,
    fallbackCount,
    ...(recordedFallbackReason ? { fallbackReason: recordedFallbackReason } : {}),
  };
}
