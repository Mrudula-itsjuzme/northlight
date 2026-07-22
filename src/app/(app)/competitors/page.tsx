import { getActiveBrandId } from "@/lib/brands/actions";
import { listCompetitors, listGapReports } from "@/lib/competitors/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { AddCompetitorForm } from "./add-competitor-form";
import { CompetitorList } from "./competitor-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default async function CompetitorsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the top bar to choose or create a brand."
      />
    );
  }

  const [competitorsResult, gapReportsResult] = await Promise.all([
    listCompetitors(brandId),
    listGapReports(brandId),
  ]);

  const competitors = competitorsResult.ok ? competitorsResult.data : [];
  const gapReports = gapReportsResult.ok ? gapReportsResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Competitor Radar</h1>
        <p className="text-muted-foreground">
          Track competitors and generate gap reports across content, schema,
          FAQ, backlink, and AI-citation opportunities.{" "}
          <DataBadge kind="demo" /> — gap reports use a deterministic demo
          adapter, not a live crawl or LLM call, unless noted otherwise.
        </p>
      </div>

      {!competitorsResult.ok && (
        <ErrorState message={competitorsResult.error} />
      )}
      {!gapReportsResult.ok && (
        <ErrorState message={gapReportsResult.error} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a competitor</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCompetitorForm brandId={brandId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Competitors</CardTitle>
          <CardDescription>
            Generate gap reports per competitor, or review existing findings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompetitorList brandId={brandId} competitors={competitors} gapReports={gapReports} />
        </CardContent>
      </Card>
    </div>
  );
}
