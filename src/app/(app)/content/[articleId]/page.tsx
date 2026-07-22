import { createClient } from "@/lib/supabase/server";
import { getActiveBrandId } from "@/lib/brands/actions";
import { getArticleForEditor, listArticleClaims } from "@/lib/content/article-actions";
import { requireRole } from "@/lib/brands/require-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArticleEditor } from "./article-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

export default async function ArticleEditorPage({
  params,
}: {
  params: { articleId: string };
}) {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the top bar to choose or create a brand."
      />
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [articleResult, claimsResult, roleResult] = await Promise.all([
    getArticleForEditor(brandId, params.articleId),
    listArticleClaims(brandId, params.articleId),
    requireRole(brandId, "viewer"),
  ]);

  if (!articleResult.ok) {
    return (
      <ErrorState message={articleResult.error} />
    );
  }

  const claims = claimsResult.ok ? claimsResult.data : [];
  const role = roleResult.ok ? roleResult.role : "viewer";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{articleResult.data.title}</h1>
        <p className="text-muted-foreground">/{articleResult.data.slug}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6 text-sm">
            <ScoreStat label="SEO" value={articleResult.data.seoScore} />
            <ScoreStat label="EEAT" value={articleResult.data.eeatScore} />
            <ScoreStat label="AI Readiness" value={articleResult.data.aiReadinessScore} />
          </div>
        </CardContent>
      </Card>

      <ArticleEditor
        brandId={brandId}
        article={articleResult.data}
        claims={claims}
        actorRole={role}
        userId={user?.id ?? ""}
      />
    </div>
  );
}

function ScoreStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value !== null ? Math.round(value) : "—"}</p>
    </div>
  );
}
