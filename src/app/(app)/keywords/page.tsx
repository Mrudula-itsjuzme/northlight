import { Suspense } from "react";
import { getActiveBrandId } from "@/lib/brands/actions";
import { listKeywords } from "@/lib/keywords/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AddKeywordForm } from "./add-keyword-form";
import { ImportKeywordsForm } from "./import-keywords-form";
import { KeywordTable } from "./keyword-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Search, Sparkles, Upload, ListFilter } from "lucide-react";

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; sortBy?: string; sortDir?: string };
}) {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const page = Number.parseInt(searchParams.page ?? "1", 10) || 1;
  const sortBy = (searchParams.sortBy ?? "priorityScore") as
    | "priorityScore"
    | "rawVolume"
    | "rawDifficulty"
    | "term"
    | "createdAt";
  const sortDir = (searchParams.sortDir ?? "desc") as "asc" | "desc";

  const result = await listKeywords(brandId, {
    page,
    search: searchParams.search,
    sortBy,
    sortDir,
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">Keyword Explorer</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
              <Search className="h-3.5 w-3.5" /> Intent Scoring Active
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Calculates multi-dimensional priority scores based on search volume, difficulty, commercial intent, trend velocity, and business value.
          </p>
        </div>
      </div>

      {!result.ok && <ErrorState message={result.error} />}

      {/* Add & Import Side-by-Side Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-400" /> Add Single Keyword
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AddKeywordForm brandId={brandId} />
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-cyan-400" /> Batch Import CSV
            </CardTitle>
            <CardDescription>
              Columns: term, volume, difficulty, commercial_intent, trend, business_value.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportKeywordsForm brandId={brandId} />
          </CardContent>
        </Card>
      </div>

      {/* Keyword Master Table */}
      <Card glass>
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListFilter className="h-5 w-5 text-primary" /> Keyword Repository
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {result.ok && (
            <Suspense fallback={<p className="text-xs text-muted-foreground animate-pulse p-4">Loading repository...</p>}>
              <KeywordTable
                brandId={brandId}
                result={result.data}
                search={searchParams.search ?? ""}
                sortBy={sortBy}
                sortDir={sortDir}
              />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
