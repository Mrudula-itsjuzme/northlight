import Link from "next/link";
import { getActiveBrandId } from "@/lib/brands/actions";
import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";

export default async function DashboardPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
  }

  const result = await getAnalyticsSnapshot(brandId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Your brand&apos;s growth overview.</p>
        </div>
        {result.ok && result.data.isDemoBrand && <DataBadge kind="demo" />}
      </div>

      {!result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result.ok && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Articles published</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{result.data.articles.published}</p>
              <p className="text-xs text-muted-foreground">
                of {result.data.articles.generated} generated
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Keyword coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {(result.data.keywords.coverageRatio * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">
                {result.data.keywords.covered}/{result.data.keywords.total} keywords have a brief
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI visibility</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {result.data.visibility.overallMentionRate === null
                  ? "N/A"
                  : `${(result.data.visibility.overallMentionRate * 100).toFixed(0)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                directional mention rate, not a citation count
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {result.data.recommendations.total - result.data.recommendations.done}
              </p>
              <p className="text-xs text-muted-foreground">
                {result.data.recommendations.done}/{result.data.recommendations.total} completed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where to go next</CardTitle>
          <CardDescription>
            Full breakdowns and trend charts live on the Analytics page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/analytics" className="text-primary underline underline-offset-4">
            View full analytics
          </Link>
          <Link href="/recommendations" className="text-primary underline underline-offset-4">
            Review recommendations
          </Link>
          <Link href="/keywords" className="text-primary underline underline-offset-4">
            Explore keywords
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
