import { getActiveBrandId } from "@/lib/brands/actions";
import { listCompetitors, listGapReports } from "@/lib/competitors/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { AddCompetitorForm } from "./add-competitor-form";
import { CompetitorList } from "./competitor-list";

export default async function CompetitorsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
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
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {competitorsResult.error}
        </div>
      )}
      {!gapReportsResult.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {gapReportsResult.error}
        </div>
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
