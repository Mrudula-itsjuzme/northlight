// Keep server-side auth and Postgres calls close to Supabase (Sydney).
export const preferredRegion = "syd1";

import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, contentPipelineRuns, brands } from "@/db/schema";
import { requireRole } from "@/lib/brands/require-role";

// Power BI can ingest the exported CSV using an authenticated browser download.
// No public, long-lived export URL or privileged database credential is exposed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  // Prevent Excel/CSV formula injection in text columns.
  const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function csv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");
  const kind = request.nextUrl.searchParams.get("kind") ?? "pipeline";
  if (!brandId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(brandId)) {
    return NextResponse.json({ error: "Valid brandId required" }, { status: 400 });
  }
  if (kind !== "pipeline" && kind !== "articles") {
    return NextResponse.json({ error: "Unsupported report type" }, { status: 400 });
  }

  const authorization = await requireRole(brandId, "viewer");
  if (!authorization.ok) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const db = getDb();
  const [brand] = await db.select({ isDemo: brands.isDemo })
    .from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let rows: Array<Array<unknown>>;
  if (kind === "pipeline") {
    const data = await db.select({
      id: contentPipelineRuns.id,
      briefId: contentPipelineRuns.briefId,
      status: contentPipelineRuns.status,
      stage: contentPipelineRuns.currentStage,
      cost: contentPipelineRuns.totalCostCents,
      tokens: contentPipelineRuns.totalTokens,
      created: contentPipelineRuns.createdAt,
    }).from(contentPipelineRuns)
      .where(eq(contentPipelineRuns.brandId, brandId))
      .orderBy(desc(contentPipelineRuns.createdAt)).limit(5000);
    rows = [
      ["run_id", "brief_id", "status", "current_stage", "cost_cents", "total_tokens", "created_at", "data_origin"],
      ...data.map((r) => [r.id, r.briefId, r.status, r.stage, r.cost, r.tokens, r.created.toISOString(), brand.isDemo ? "demo" : "actual"]),
    ];
  } else {
    const data = await db.select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      seo: articles.seoScore,
      aiReadiness: articles.aiReadinessScore,
      published: articles.publishedAt,
      created: articles.createdAt,
    }).from(articles)
      .where(eq(articles.brandId, brandId))
      .orderBy(desc(articles.createdAt)).limit(5000);
    rows = [
      ["article_id", "title", "status", "seo_score", "ai_readiness_score", "published_at", "created_at", "data_origin"],
      ...data.map((r) => [r.id, r.title, r.status, r.seo, r.aiReadiness, r.published?.toISOString(), r.created.toISOString(), brand.isDemo ? "demo" : "actual"]),
    ];
  }

  return new NextResponse(csv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="northlight-${kind}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
