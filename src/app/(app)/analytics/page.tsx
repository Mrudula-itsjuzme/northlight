import { getActiveBrandId } from "@/lib/brands/actions";
import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { DataBadge } from "@/components/ui/data-badge";
import { AnalyticsCharts } from "./analytics-charts";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default async function AnalyticsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the top bar to choose or create a brand."
      />
    );
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
        <ErrorState message={result.error} />
      )}

      {result.ok && <AnalyticsCharts data={result.data} />}
    </div>
  );
}
