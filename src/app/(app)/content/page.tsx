import { getActiveBrandId } from "@/lib/brands/actions";
import { listContentBriefs, listPipelineRuns } from "@/lib/content/actions";
import { listKeywords } from "@/lib/keywords/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BriefList } from "./brief-list";
import { GenerateBriefForm } from "./generate-brief-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default async function ContentPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the top bar to choose or create a brand."
      />
    );
  }

  const [briefsResult, runsResult, keywordsResult] = await Promise.all([
    listContentBriefs(brandId),
    listPipelineRuns(brandId),
    listKeywords(brandId, { pageSize: 100 }),
  ]);

  const briefs = briefsResult.ok ? briefsResult.data : [];
  const runs = runsResult.ok ? runsResult.data : [];
  const keywordOptions = keywordsResult.ok
    ? keywordsResult.data.items.map((k) => ({ id: k.id, term: k.term }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Pipeline</h1>
        <p className="text-muted-foreground">
          Content briefs generated from keywords (Keyword Explorer) run
          through 8 stages — Research, Strategy, Outline, Writer, Editor,
          SEO Optimizer, Fact Check, Schema Generator — each persisted and
          retryable independently.
        </p>
      </div>

      {!briefsResult.ok && (
        <ErrorState message={briefsResult.error} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Generate a brief from a keyword</CardTitle>
          <CardDescription>
            Or use the Keyword Explorer&apos;s &ldquo;Generate brief&rdquo;
            button, which queues the same generation as a background job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateBriefForm brandId={brandId} keywords={keywordOptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Content briefs</CardTitle>
        </CardHeader>
        <CardContent>
          <BriefList brandId={brandId} briefs={briefs} runs={runs} />
        </CardContent>
      </Card>
    </div>
  );
}
