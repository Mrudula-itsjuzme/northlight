"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBrandDocument, reindexBrandDocument, type BrandDocumentSummary } from "@/lib/brand-brain/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles, FileText, Database, RotateCcw, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  chunking: "Chunking...",
  embedding: "Embedding...",
  ready: "Ready",
  failed: "Failed",
};

export function DocumentList({
  brandId,
  documents,
}: {
  brandId: string;
  documents: BrandDocumentSummary[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function onDelete(documentId: string) {
    setPendingId(documentId);
    try {
      await deleteBrandDocument(brandId, documentId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function onReindex(documentId: string) {
    setPendingId(documentId);
    try {
      await reindexBrandDocument(brandId, documentId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No knowledge documents uploaded yet"
        description="Upload a brand document above to start building your Brand Brain knowledge repository."
      />
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="rounded-2xl border border-border/80 bg-card/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md transition-all hover:border-primary/30"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">{doc.title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="uppercase font-mono text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded font-semibold text-foreground/90">
                  {doc.sourceType}
                </span>
                <span>•</span>
                <span className="font-mono text-cyan-400 font-semibold flex items-center gap-1">
                  <Database className="h-3 w-3" /> {doc.chunkCount} {doc.chunkCount === 1 ? "chunk" : "chunks"}
                </span>
                <span>•</span>
                <span
                  className={cn(
                    "font-semibold text-[11px] capitalize",
                    doc.status === "ready"
                      ? "text-emerald-400 flex items-center gap-1"
                      : doc.status === "failed"
                      ? "text-rose-400 flex items-center gap-1"
                      : "text-amber-400 animate-pulse",
                  )}
                >
                  {doc.status === "ready" ? <CheckCircle2 className="h-3 w-3" /> : doc.status === "failed" ? <AlertTriangle className="h-3 w-3" /> : null}
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </span>
              </div>
              {doc.error && <p className="text-xs text-rose-400 mt-1 font-medium">{doc.error}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {doc.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                disabled={pendingId === doc.id}
                onClick={() => onReindex(doc.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Re-index
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs px-2.5"
              disabled={pendingId === doc.id}
              onClick={() => onDelete(doc.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
