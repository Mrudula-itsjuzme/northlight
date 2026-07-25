import { getActiveBrandId } from "@/lib/brands/actions";
import { listCompetitors, listGapReports } from "@/lib/competitors/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { AddCompetitorForm } from "./add-competitor-form";
import { CompetitorList } from "./competitor-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Radar, PlusCircle } from "lucide-react";

export default async function CompetitorsPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">Competitor Radar</h1>
            <DataBadge kind="demo" />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Track rival brands, map domain overlap, and run automated gap reports across content, schema, FAQ, backlink, and AI-citation vectors.
          </p>
        </div>
      </div>

      {!competitorsResult.ok && <ErrorState message={competitorsResult.error} />}
      {!gapReportsResult.ok && <ErrorState message={gapReportsResult.error} />}

      {/* Add Competitor */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-violet-400" /> Track New Competitor Domain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddCompetitorForm brandId={brandId} />
        </CardContent>
      </Card>

      {/* Competitor Matrix & Reports */}
      <Card glass>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Radar className="h-5 w-5 text-cyan-400" /> Competitor Intelligence Radar ({competitors.length})
            </CardTitle>
          </div>
          <CardDescription>
            Generate gap reports per competitor domain to isolate uncaptured market demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <CompetitorList brandId={brandId} competitors={competitors} gapReports={gapReports} />
        </CardContent>
      </Card>
    </div>
  );
}
