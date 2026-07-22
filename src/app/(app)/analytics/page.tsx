import { getActiveBrandId } from "@/lib/brands/actions";
import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { DataBadge } from "@/components/ui/data-badge";
import { AnalyticsCharts } from "./analytics-charts";

export default async function AnalyticsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
  }

  const result = await getAnalyticsSnapshot(brandId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Content, cost, keyword, and AI visibility trends computed from
            your brand&apos;s stored data.
          </p>
        </div>
        {result.ok && result.data.isDemoBrand && <DataBadge kind="demo" />}
      </div>

      {!result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      {result.ok && <AnalyticsCharts data={result.data} />}
    </div>
  );
}
