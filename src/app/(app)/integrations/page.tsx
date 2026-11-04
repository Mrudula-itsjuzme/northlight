import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, contentPipelineRuns, brands } from "@/db/schema";
import { getActiveBrandId } from "@/lib/brands/actions";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { BarChart3, FileCheck, ExternalLink, Workflow, Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

export default async function IntegrationsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <div className="space-y-2"><h1 className="text-2xl font-bold">Microsoft integrations</h1><p>Select a brand to see its reporting and review workspace.</p></div>;
  }
  await requireRoleOrThrow(brandId, "viewer");
  const db = getDb();
  const [brandRows, reviewArticles, recentRuns] = await Promise.all([
    db.select({ name: brands.name, isDemo: brands.isDemo }).from(brands).where(eq(brands.id, brandId)).limit(1),
    db.select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      seoScore: articles.seoScore,
      aiReadinessScore: articles.aiReadinessScore,
      createdAt: articles.createdAt,
    }).from(articles).where(eq(articles.brandId, brandId)).orderBy(desc(articles.createdAt)).limit(30),
    db.select({ id: contentPipelineRuns.id, status: contentPipelineRuns.status, totalCostCents: contentPipelineRuns.totalCostCents })
      .from(contentPipelineRuns).where(eq(contentPipelineRuns.brandId, brandId)).orderBy(desc(contentPipelineRuns.createdAt)).limit(100),
  ]);
  const brand = brandRows[0];
  const total = reviewArticles.length;
  const pending = reviewArticles.filter(a => a.status === "review").length;
  const published = reviewArticles.filter(a => a.status === "published").length;
  const completedRuns = recentRuns.filter(r => r.status === "completed").length;
  const automationsConfigured = Boolean(process.env.POWER_AUTOMATE_REVIEW_WEBHOOK_URL);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Microsoft Operations Hub</h1>
          {brand?.isDemo && <DataBadge kind="demo" />}
        </div>
        <p className="text-sm text-muted-foreground">
          Live tenant-scoped operations for {brand?.name ?? "your brand"}. Microsoft report publishing and Power Apps connections are separate setup steps.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Recent articles", total],
          ["Awaiting review", pending],
          ["Published", published],
          ["Completed runs", completedRuns],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-border/70 bg-card/60 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5"/> Power BI</CardTitle>
            <CardDescription>Export current brand data for the Northlight report template.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a className="flex items-center gap-2 text-sm text-primary underline" href={`/api/integrations/power-bi/export?brandId=${encodeURIComponent(brandId)}&kind=pipeline`}>
              <Download className="h-4 w-4"/> Pipeline CSV
            </a>
            <a className="flex items-center gap-2 text-sm text-primary underline" href={`/api/integrations/power-bi/export?brandId=${encodeURIComponent(brandId)}&kind=articles`}>
              <Download className="h-4 w-4"/> Article CSV
            </a>
            <p className="text-xs text-muted-foreground">Exports are capped at 5,000 rows per dataset. Data stays scoped to this brand.</p>
          </CardContent>
        </Card>
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5"/> Power Automate</CardTitle>
            <CardDescription>Content completion notifications. The flow cannot approve or publish content.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium text-sm">{automationsConfigured ? "Webhook configured" : "Webhook not configured"}</p>
            <p className="text-xs text-muted-foreground">
              {automationsConfigured
                ? "Configured on this deployment. Delivery requires a valid flow endpoint."
                : "Create an HTTP-triggered flow, then set POWER_AUTOMATE_REVIEW_WEBHOOK_URL as a server-only Preview environment variable in Vercel."}
            </p>
            <a className="text-sm text-primary underline" href="https://make.powerautomate.com/" target="_blank" rel="noopener noreferrer">Open Power Automate</a>
          </CardContent>
        </Card>
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileCheck className="h-5 w-5"/> Power Apps</CardTitle>
            <CardDescription>Use the review queue below as a working reference for an internal canvas app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">Northlight remains the approval authority.</p>
            <p className="text-xs text-muted-foreground">An external Power Apps app must have separate tenant-scoped authentication; do not expose service-role keys.</p>
            <a className="text-sm text-primary underline" href="https://make.powerapps.com/" target="_blank" rel="noopener noreferrer">Open Power Apps</a>
          </CardContent>
        </Card>
      </div>
      <Card glass>
        <CardHeader>
          <CardTitle>Content review queue</CardTitle>
          <CardDescription>
            Current article states from Northlight. Open an article to review its claims and use the existing protected approval workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reviewArticles.length ? (
            <div className="divide-y divide-border/50">
              {reviewArticles.map(a => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {a.status} · SEO: {a.seoScore?.toFixed(1) ?? "N/A"} · AI readiness: {a.aiReadinessScore?.toFixed(1) ?? "N/A"}
                    </p>
                  </div>
                  <Link href={`/content/${a.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline">
                    Open review <ExternalLink className="h-3 w-3"/>
                  </Link>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No articles for this brand yet. Generate content to populate the queue.</p>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">The queue shows the 30 most recently created articles. Published metrics on this page are not lifetime totals if that limit is exceeded.</p>
    </div>
  );
}
