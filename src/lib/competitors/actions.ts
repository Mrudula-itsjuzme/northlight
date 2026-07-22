"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { competitors, competitorPages, gapReports } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import {
  competitorSchema,
  competitorPageSchema,
  type CompetitorInput,
  type CompetitorPageInput,
  type GapReportType,
} from "@/lib/validation/competitors";
import {
  persistGapReportsForCompetitor,
  persistGapReportsForCompetitorWithRealFetch,
} from "@/lib/competitors/persist-gap-reports";
import { isBrandDemo } from "@/lib/brands/actions";
import type { ActionResult } from "@/lib/brands/types";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function createCompetitor(
  brandId: string,
  input: CompetitorInput,
): Promise<ActionResult<{ competitorId: string }>> {
  const parsed = competitorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [competitor] = await db
      .insert(competitors)
      .values({ brandId, name: parsed.data.name, domain: parsed.data.domain })
      .returning({ id: competitors.id });

    revalidatePath("/competitors");
    return { ok: true, data: { competitorId: competitor.id } };
  } catch (err) {
    return toActionError(err, "Failed to add competitor.");
  }
}

export async function deleteCompetitor(brandId: string, competitorId: string): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .delete(competitors)
      .where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)));

    revalidatePath("/competitors");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to delete competitor.");
  }
}

export async function addCompetitorPage(
  brandId: string,
  competitorId: string,
  input: CompetitorPageInput,
): Promise<ActionResult<{ pageId: string }>> {
  const parsed = competitorPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [page] = await db
      .insert(competitorPages)
      .values({
        brandId,
        competitorId,
        url: parsed.data.url,
        title: parsed.data.title || null,
        fetchedAt: new Date(),
      })
      .returning({ id: competitorPages.id });

    revalidatePath("/competitors");
    return { ok: true, data: { pageId: page.id } };
  } catch (err) {
    return toActionError(err, "Failed to add competitor page.");
  }
}

export type CompetitorListItem = {
  id: string;
  name: string;
  domain: string;
  pageCount: number;
  gapReportCount: number;
};

export async function listCompetitors(
  brandId: string,
): Promise<ActionResult<CompetitorListItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const rows = await db
      .select()
      .from(competitors)
      .where(eq(competitors.brandId, brandId))
      .orderBy(desc(competitors.createdAt));

    const items: CompetitorListItem[] = [];
    for (const row of rows) {
      const pages = await db
        .select({ id: competitorPages.id })
        .from(competitorPages)
        .where(eq(competitorPages.competitorId, row.id));
      const reports = await db
        .select({ id: gapReports.id })
        .from(gapReports)
        .where(eq(gapReports.competitorId, row.id));

      items.push({
        id: row.id,
        name: row.name,
        domain: row.domain,
        pageCount: pages.length,
        gapReportCount: reports.length,
      });
    }

    return { ok: true, data: items };
  } catch (err) {
    return toActionError(err, "Failed to list competitors.");
  }
}

export type GapReportItem = {
  id: string;
  competitorId: string;
  type: GapReportType;
  findings: unknown;
  priorityScore: number | null;
  isDemo: boolean;
  generatedBy: string;
  createdAt: Date;
};

export async function listGapReports(
  brandId: string,
  competitorId?: string,
): Promise<ActionResult<GapReportItem[]>> {
  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();

    const conditions = competitorId
      ? and(eq(gapReports.brandId, brandId), eq(gapReports.competitorId, competitorId))
      : eq(gapReports.brandId, brandId);

    const rows = await db
      .select()
      .from(gapReports)
      .where(conditions)
      .orderBy(desc(gapReports.createdAt));

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        competitorId: r.competitorId,
        type: r.type as GapReportType,
        findings: r.findings,
        priorityScore: r.priorityScore,
        isDemo: r.isDemo,
        generatedBy: r.generatedBy,
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    return toActionError(err, "Failed to list gap reports.");
  }
}

/**
 * Generates gap reports across all 5 gap types (content/schema/faq/
 * backlink/ai_citation) for one competitor.
 *
 * For a real (non-demo) brand, this tries the real fetch+parse adapter
 * first (src/lib/competitors/fetch-adapter.ts) against the competitor's
 * most recently added page URL, for the 3 gap types it can meaningfully
 * derive from a single fetched page (content/schema/faq — see
 * real-analysis.ts). On any failure (no page URL on file, robots.txt
 * disallow, timeout, non-2xx, non-HTML content-type, oversized response),
 * or for the 2 types it never supports (backlink/ai_citation), it falls
 * back to the deterministic demo analysis adapter
 * (src/lib/competitors/gap-analysis.ts) and records the fallback reason on
 * the persisted row (`findings.fallbackReason`,
 * `generated_by='demo_adapter_fallback'`).
 *
 * The seeded demo brand (`brands.is_demo`) ALWAYS uses the fully
 * deterministic path (`persistGapReportsForCompetitor`) and never reaches
 * the real fetch adapter — checked here via `isBrandDemo`, and also
 * enforced independently by `scripts/seed.ts` calling
 * `persistGapReportsForCompetitor` directly rather than through this
 * action at all.
 */
export async function generateGapReportsForCompetitor(
  brandId: string,
  competitorId: string,
): Promise<ActionResult<{ reportCount: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const isDemo = await isBrandDemo(brandId);
    const result = isDemo
      ? await persistGapReportsForCompetitor(brandId, competitorId)
      : await persistGapReportsForCompetitorWithRealFetch(brandId, competitorId);
    revalidatePath("/competitors");
    return { ok: true, data: { reportCount: result.reportCount } };
  } catch (err) {
    return toActionError(err, "Failed to generate gap reports.");
  }
}
