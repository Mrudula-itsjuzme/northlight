import { getActiveBrandId } from "@/lib/brands/actions";
import { listRecommendations } from "@/lib/recommendations/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RecommendationList } from "./recommendation-list";

export default async function RecommendationsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
  }

  const result = await listRecommendations(brandId);
  const recommendations = result.ok ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recommendations</h1>
        <p className="text-muted-foreground">
          Ranked action items derived from your keyword priorities,
          competitor gaps, content quality, and AI visibility signals.
        </p>
      </div>

      {!result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ranked recommendations</CardTitle>
          <CardDescription>
            Recompute after adding keywords, gap reports, articles, or
            visibility snapshots to refresh this list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecommendationList brandId={brandId} recommendations={recommendations} />
        </CardContent>
      </Card>
    </div>
  );
}
