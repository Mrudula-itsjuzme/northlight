import { getActiveBrandId, isBrandDemo } from "@/lib/brands/actions";
import { listRecommendations } from "@/lib/recommendations/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { RecommendationList } from "./recommendation-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Lightbulb, Zap } from "lucide-react";

export default async function RecommendationsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const [result, isDemo] = await Promise.all([listRecommendations(brandId), isBrandDemo(brandId)]);
  const recommendations = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">ROI Recommendation Engine</h1>
            {isDemo && <DataBadge kind="demo" />}
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            AI-prioritized growth action items computed from keyword opportunities, competitor gaps, content quality gates, and AI visibility signals.
          </p>
        </div>
      </div>

      {!result.ok && <ErrorState message={result.error} />}

      {/* Main List Card */}
      <Card glass>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-400" /> Ranked Action Queue ({recommendations.length})
            </CardTitle>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> High ROI First
            </span>
          </div>
          <CardDescription>
            Recompute recommendations after adding new keywords, competitor gaps, or visibility snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <RecommendationList brandId={brandId} recommendations={recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}
