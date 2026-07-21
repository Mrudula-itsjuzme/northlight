"use server";

import { revalidatePath } from "next/cache";
import { eq, and, asc, desc, ilike, gte, lte, count } from "drizzle-orm";
import { getDb } from "@/db";
import { keywords, keywordClusters, clusterKeywords as clusterKeywordsTable, jobs } from "@/db/schema";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import { keywordSchema, keywordFilterSchema, type KeywordInput, type KeywordFilterInput } from "@/lib/validation/keywords";
import { parseKeywordsCsv } from "@/lib/csv/parse-keywords";
import { rescoreAllKeywords } from "@/lib/keywords/rescore";
import { clusterKeywords as computeClusters } from "@/lib/scoring/cluster";
import type { ActionResult } from "@/lib/brands/types";
import type { CsvRowError } from "@/lib/csv/parse-products";

function toActionError(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof RoleError) return { ok: false, error: err.message };
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function createKeyword(
  brandId: string,
  input: KeywordInput,
): Promise<ActionResult<{ keywordId: string }>> {
  const parsed = keywordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    const [keyword] = await db
      .insert(keywords)
      .values({
        brandId,
        term: parsed.data.term,
        rawVolume: parsed.data.rawVolume,
        rawDifficulty: parsed.data.rawDifficulty,
        rawCommercialIntent: parsed.data.rawCommercialIntent,
        rawTrend: parsed.data.rawTrend,
        rawBusinessValue: parsed.data.rawBusinessValue,
        source: "manual",
      })
      .returning({ id: keywords.id });

    await rescoreAllKeywords(brandId);
    revalidatePath("/keywords");
    return { ok: true, data: { keywordId: keyword.id } };
  } catch (err) {
    return toActionError(err, "Failed to create keyword.");
  }
}

export async function updateKeyword(
  brandId: string,
  keywordId: string,
  input: KeywordInput,
): Promise<ActionResult> {
  const parsed = keywordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .update(keywords)
      .set({
        term: parsed.data.term,
        rawVolume: parsed.data.rawVolume,
        rawDifficulty: parsed.data.rawDifficulty,
        rawCommercialIntent: parsed.data.rawCommercialIntent,
        rawTrend: parsed.data.rawTrend,
        rawBusinessValue: parsed.data.rawBusinessValue,
        updatedAt: new Date(),
      })
      .where(and(eq(keywords.id, keywordId), eq(keywords.brandId, brandId)));

    await rescoreAllKeywords(brandId);
    revalidatePath("/keywords");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to update keyword.");
  }
}

export async function deleteKeyword(brandId: string, keywordId: string): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();
    await db
      .delete(keywords)
      .where(and(eq(keywords.id, keywordId), eq(keywords.brandId, brandId)));

    await rescoreAllKeywords(brandId);
    revalidatePath("/keywords");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err, "Failed to delete keyword.");
  }
}

export type ImportKeywordsCsvResult = {
  imported: number;
  totalRows: number;
  rowErrors: CsvRowError[];
};

export async function importKeywordsCsv(
  brandId: string,
  csvContents: string,
): Promise<ActionResult<ImportKeywordsCsvResult>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const { validRows, errors, totalRows } = parseKeywordsCsv(csvContents);

    if (validRows.length > 0) {
      const db = getDb();
      await db
        .insert(keywords)
        .values(
          validRows.map((row) => ({
            brandId,
            term: row.term,
            rawVolume: row.rawVolume,
            rawDifficulty: row.rawDifficulty,
            rawCommercialIntent: row.rawCommercialIntent,
            rawTrend: row.rawTrend,
            rawBusinessValue: row.rawBusinessValue,
            source: "csv_import",
          })),
        )
        .onConflictDoNothing();

      await rescoreAllKeywords(brandId);
    }

    revalidatePath("/keywords");
    return { ok: true, data: { imported: validRows.length, totalRows, rowErrors: errors } };
  } catch (err) {
    return toActionError(err, "Failed to import keywords.");
  }
}

export type KeywordListItem = {
  id: string;
  term: string;
  rawVolume: number;
  rawDifficulty: number;
  rawCommercialIntent: number;
  rawTrend: number;
  rawBusinessValue: number;
  priorityScore: number | null;
  aiCitationOpportunity: number | null;
  source: string;
  createdAt: Date;
};

export type ListKeywordsResult = {
  items: KeywordListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const SORT_COLUMN_MAP = {
  priorityScore: keywords.priorityScore,
  rawVolume: keywords.rawVolume,
  rawDifficulty: keywords.rawDifficulty,
  term: keywords.term,
  createdAt: keywords.createdAt,
} as const;

export async function listKeywords(
  brandId: string,
  filters: Partial<KeywordFilterInput>,
): Promise<ActionResult<ListKeywordsResult>> {
  const parsed = keywordFilterSchema.safeParse(filters);
  if (!parsed.success) {
    return { ok: false, error: "Invalid filters.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await requireRoleOrThrow(brandId, "viewer");
    const db = getDb();
    const { search, minPriority, maxPriority, sortBy, sortDir, page, pageSize } = parsed.data;

    const conditions = [eq(keywords.brandId, brandId)];
    if (search) conditions.push(ilike(keywords.term, `%${search}%`));
    if (minPriority !== undefined) conditions.push(gte(keywords.priorityScore, minPriority));
    if (maxPriority !== undefined) conditions.push(lte(keywords.priorityScore, maxPriority));

    const whereClause = and(...conditions);
    const sortColumn = SORT_COLUMN_MAP[sortBy];
    const orderFn = sortDir === "asc" ? asc : desc;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(keywords)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(keywords).where(whereClause),
    ]);

    return {
      ok: true,
      data: {
        items,
        total: totalResult[0]?.value ?? 0,
        page,
        pageSize,
      },
    };
  } catch (err) {
    return toActionError(err, "Failed to list keywords.");
  }
}

/**
 * Recomputes deterministic clusters for the brand's current keyword set
 * (src/lib/scoring/cluster.ts — no ML dependency) and persists them,
 * replacing any prior clusters (a full recompute, not an incremental
 * merge, since cluster membership can shift as keywords are added).
 */
export async function generateKeywordClusters(
  brandId: string,
): Promise<ActionResult<{ clusterCount: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const rows = await db
      .select({ id: keywords.id, term: keywords.term })
      .from(keywords)
      .where(eq(keywords.brandId, brandId));

    const clusters = computeClusters(rows);

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: keywordClusters.id })
        .from(keywordClusters)
        .where(eq(keywordClusters.brandId, brandId));
      for (const row of existing) {
        await tx.delete(keywordClusters).where(eq(keywordClusters.id, row.id));
      }

      for (const cluster of clusters) {
        const [clusterRow] = await tx
          .insert(keywordClusters)
          .values({ brandId, name: cluster.name })
          .returning({ id: keywordClusters.id });

        for (const keywordId of cluster.keywordIds) {
          await tx.insert(clusterKeywordsTable).values({
            brandId,
            clusterId: clusterRow.id,
            keywordId,
          });
        }
      }
    });

    revalidatePath("/keywords");
    return { ok: true, data: { clusterCount: clusters.length } };
  } catch (err) {
    return toActionError(err, "Failed to generate clusters.");
  }
}

/**
 * "Generate Brief" — does NOT block synchronously on an LLM call. Creates
 * a `jobs` row (type `generate_content_brief`) that the Phase 12 worker
 * picks up; the content pipeline (Phase 7) defines what that job actually
 * does. This keeps the UI responsive and gives the user a real, visible
 * job status instead of a spinner tied to a long-running request.
 */
export async function generateBriefFromKeyword(
  brandId: string,
  keywordId: string,
): Promise<ActionResult<{ jobId: string }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const [keyword] = await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(and(eq(keywords.id, keywordId), eq(keywords.brandId, brandId)))
      .limit(1);

    if (!keyword) {
      return { ok: false, error: "Keyword not found." };
    }

    const [job] = await db
      .insert(jobs)
      .values({
        brandId,
        type: "generate_content_brief",
        payload: { keywordId },
      })
      .returning({ id: jobs.id });

    revalidatePath("/keywords");
    return { ok: true, data: { jobId: job.id } };
  } catch (err) {
    return toActionError(err, "Failed to queue brief generation.");
  }
}

export async function rescoreKeywords(brandId: string): Promise<ActionResult<{ scored: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const result = await rescoreAllKeywords(brandId);
    revalidatePath("/keywords");
    return { ok: true, data: result };
  } catch (err) {
    return toActionError(err, "Failed to rescore keywords.");
  }
}
