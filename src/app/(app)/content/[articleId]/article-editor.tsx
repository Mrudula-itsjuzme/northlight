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
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, ShieldAlert, FileCode, Edit3, Send } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  review: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  published: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-glow-cyan",
};

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
      {/* Editor & Schema Preview */}
      <div className="space-y-6 lg:col-span-2">
        <Card glass>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-primary" />
              <CardTitle>Interactive Article Canvas</CardTitle>
            </div>
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              {saveStatus === "saving" ? (
                <span className="text-amber-400 animate-pulse">Autosaving...</span>
              ) : saveStatus === "saved" ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All changes saved
                </span>
              ) : null}
            </span>
          </CardHeader>
          <CardContent className="pt-6">
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={onContentChange}
              dangerouslySetInnerHTML={{ __html: article.content }}
              className="min-h-[460px] rounded-xl border border-border/80 bg-card/60 p-6 text-sm text-foreground leading-relaxed focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-inner [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-gradient-purple [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-3"
            />
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCode className="h-4 w-4 text-cyan-400" /> JSON-LD Schema Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-xl border border-border/60 bg-zinc-950 p-4 font-mono text-xs text-cyan-300 shadow-inner">
              {article.jsonLd ? JSON.stringify(article.jsonLd, null, 2) : "// No schema generated yet."}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Control Sidebar */}
      <div className="space-y-6">
        <Card glass>
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 pb-4">
            <CardTitle className="text-base">Publish Gate Status</CardTitle>
            <span
              className={cn(
                "rounded-full border px-3 py-0.5 text-xs font-semibold capitalize tracking-wide shadow-sm",
                STATUS_STYLES[article.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {article.status}
            </span>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {article.status === "draft" && (
              <Button variant="gradient" size="sm" className="w-full" onClick={() => onTransition("review")}>
                Move to Review Stage
              </Button>
            )}
            {article.status === "review" && (
              <div className="flex flex-col gap-2">
                <Button variant="gradient" size="sm" className="w-full" onClick={() => onTransition("approved")}>
                  Approve Article
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => onTransition("draft")}
                >
                  Return to Draft
                </Button>
              </div>
            )}
            {article.status === "approved" && (
              <div className="flex flex-col gap-2">
                {publishError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{publishError}</span>
                  </div>
                )}
                <Button
                  variant="gradient"
                  size="sm"
                  className="w-full shadow-glow"
                  disabled={publishPending || !gatePreview.canPublish}
                  onClick={onPublish}
                >
                  <Send className="h-4 w-4" />
                  {publishPending ? "Publishing Live..." : "Publish Article"}
                </Button>
                {!gatePreview.canPublish && (
                  <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>{gatePreview.reason}</span>
                  </p>
                )}
              </div>
            )}
            {article.status === "published" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-400 flex items-center justify-center gap-2 shadow-glow-emerald">
                <CheckCircle2 className="h-4 w-4" /> Live & Published
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fact Claims Verification */}
        <Card glass>
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Fact Claims ({claims.length})</span>
              {claims.some((c) => c.status === "unresolved") && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
                  Gate Unresolved
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {claims.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No fact claims flagged in this article.</p>
            )}
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                      claim.verificationStatus === "verified"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : claim.verificationStatus === "unsupported" || claim.verificationStatus === "contradictory"
                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30",
                    )}
                  >
                    {claim.verificationStatus?.replace("_", " ") ?? "requires review"}
                  </span>
                  {claim.confidence !== null && claim.confidence !== undefined && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Conf: {Math.round(claim.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    "rounded-lg p-2 font-medium leading-relaxed",
                    claim.status === "unresolved"
                      ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : claim.status === "overridden"
                        ? "border border-purple-500/30 bg-purple-500/10 text-purple-300"
                        : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                  )}
                >
                  {claim.claimText}
                </p>
                {claim.sourceReference && (
                  <p className="text-[11px] text-cyan-400/90 font-mono flex items-center gap-1">
                    <span className="font-semibold text-muted-foreground">Source:</span> {claim.sourceReference}
                  </p>
                )}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span className="capitalize font-mono">Status: {claim.status}</span>
                  {claim.status === "unresolved" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResolve(claim.id)}>
                        Resolve
                      </Button>
                      {actorRole === "owner" && (
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => onOverride(claim.id)}>
                          Override
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
