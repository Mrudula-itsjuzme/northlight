import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { competitors, gapReports } from "@/db/schema";
import { gapReportTypes } from "@/lib/validation/competitors";
import { generateGapReport } from "@/lib/competitors/gap-analysis";

/**
 * Role-free core: generates and persists all 5 gap report types for one
 * competitor. Split out of the `"use server"` action
 * (generateGapReportsForCompetitor in actions.ts) so it can also be
 * called directly by the background job worker (Phase 12,
 * `generate_gap_report` job type), which runs outside an authenticated
 * request context and therefore cannot go through
 * `requireRoleOrThrow`'s cookie-based session lookup. The worker itself
 * is the trusted actor picking up already-authorized queued work (the
 * job row was only ever queued by a request that DID pass the role
 * gate), matching the same core/action split already used by
 * runPipeline, generateContentBrief, and processDocument.
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
