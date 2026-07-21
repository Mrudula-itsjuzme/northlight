"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  autosaveArticleContent,
  transitionArticleState,
  resolveClaim,
  overrideClaim,
  publishArticle,
  type ArticleWithVersion,
  type ArticleClaimItem,
} from "@/lib/content/article-actions";
import { canPublish } from "@/lib/content/publish-gate";
import type { BrandRole } from "@/lib/validation/brands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AUTOSAVE_DEBOUNCE_MS = 1500;

export function ArticleEditor({
  brandId,
  article,
  claims,
  actorRole,
  userId,
}: {
  brandId: string;
  article: ArticleWithVersion;
  claims: ArticleClaimItem[];
  actorRole: BrandRole;
  userId: string;
}) {
  const router = useRouter();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishPending, setPublishPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doAutosave = useCallback(
    async (value: string) => {
      setSaveStatus("saving");
      await autosaveArticleContent(brandId, article.id, value, userId);
      setSaveStatus("saved");
    },
    [brandId, article.id, userId],
  );

  function onContentChange(e: React.FormEvent<HTMLDivElement>) {
    const value = e.currentTarget.innerHTML;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doAutosave(value), AUTOSAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function onTransition(nextState: "draft" | "review" | "approved") {
    await transitionArticleState(brandId, article.id, nextState);
    router.refresh();
  }

  async function onResolve(claimId: string) {
    const note = window.prompt("Resolution note:");
    if (!note) return;
    await resolveClaim(brandId, claimId, note, userId);
    router.refresh();
  }

  async function onOverride(claimId: string) {
    const reason = window.prompt("Override reason (owner only):");
    if (!reason) return;
    await overrideClaim(brandId, claimId, reason, userId);
    router.refresh();
  }

  async function onPublish() {
    setPublishPending(true);
    setPublishError(null);
    try {
      const result = await publishArticle(brandId, article.id);
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPublishPending(false);
    }
  }

  const gatePreview = canPublish(
    claims.map((c) => ({ status: c.status as "unresolved" | "resolved" | "overridden" })),
    actorRole,
    claims.some((c) => c.status === "overridden"),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Editor</CardTitle>
            <span className="text-xs text-muted-foreground">
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : ""}
            </span>
          </CardHeader>
          <CardContent>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={onContentChange}
              dangerouslySetInnerHTML={{ __html: article.content }}
              className="min-h-[400px] rounded-md border p-4 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-medium [&_p]:mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>JSON-LD preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {article.jsonLd ? JSON.stringify(article.jsonLd, null, 2) : "No schema generated yet."}
            </pre>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Status: {article.status}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {article.status === "draft" && (
              <Button size="sm" className="w-full" onClick={() => onTransition("review")}>
                Move to review
              </Button>
            )}
            {article.status === "review" && (
              <>
                <Button size="sm" className="w-full" onClick={() => onTransition("approved")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onTransition("draft")}
                >
                  Back to draft
                </Button>
              </>
            )}
            {article.status === "approved" && (
              <>
                {publishError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {publishError}
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={publishPending || !gatePreview.canPublish}
                  onClick={onPublish}
                >
                  {publishPending ? "Publishing..." : "Publish"}
                </Button>
                {!gatePreview.canPublish && (
                  <p className="text-xs text-muted-foreground">{gatePreview.reason}</p>
                )}
              </>
            )}
            {article.status === "published" && (
              <p className="text-sm text-success-foreground">Published.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claims ({claims.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {claims.length === 0 && (
              <p className="text-sm text-muted-foreground">No claims flagged.</p>
            )}
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-md border p-2 text-xs">
                <p
                  className={
                    claim.status === "unresolved"
                      ? "bg-destructive/10 px-1 text-destructive"
                      : claim.status === "overridden"
                        ? "bg-demo/10 px-1 text-demo"
                        : "bg-success/10 px-1 text-success-foreground"
                  }
                >
                  {claim.claimText}
                </p>
                <p className="mt-1 text-muted-foreground">status: {claim.status}</p>
                {claim.status === "unresolved" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onResolve(claim.id)}>
                      Resolve
                    </Button>
                    {actorRole === "owner" && (
                      <Button size="sm" variant="destructive" onClick={() => onOverride(claim.id)}>
                        Override
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
