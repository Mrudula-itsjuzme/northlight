import { getActiveBrandId } from "@/lib/brands/actions";
import { listKeywords } from "@/lib/keywords/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AddKeywordForm } from "./add-keyword-form";
import { ImportKeywordsForm } from "./import-keywords-form";
import { KeywordTable } from "./keyword-table";

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; sortBy?: string; sortDir?: string };
}) {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Keyword Explorer</h1>
        <p className="text-muted-foreground">
          Priority = 0.30·volume + 0.25·(1−difficulty) + 0.20·commercial intent
          + 0.15·trend + 0.10·business value, min-max normalized against
          your keyword set. See AI_SCORING.md for the full formula and a
          worked example.
        </p>
      </div>

      {!result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add a keyword</CardTitle>
          </CardHeader>
          <CardContent>
            <AddKeywordForm brandId={brandId} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Import CSV</CardTitle>
            <CardDescription>
              Columns: term, volume, difficulty, commercial_intent, trend,
              business_value.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportKeywordsForm brandId={brandId} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Keywords</CardTitle>
        </CardHeader>
        <CardContent>
          {result.ok && (
            <KeywordTable
              brandId={brandId}
              result={result.data}
              search={searchParams.search ?? ""}
              sortBy={sortBy}
              sortDir={sortDir}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
