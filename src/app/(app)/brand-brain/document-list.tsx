"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteBrandDocument, reindexBrandDocument, type BrandDocumentSummary } from "@/lib/brand-brain/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkles } from "lucide-react";

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
        title="No documents uploaded yet"
        description="Upload a brand document above to start building your Brand Brain (chunked, embedded, and searchable)."
      />
    );
  }

  return (
    <div className="divide-y">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-center justify-between py-3">
          <div>
            <p className="font-medium">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {doc.sourceType.toUpperCase()} · {STATUS_LABEL[doc.status] ?? doc.status} ·{" "}
              {doc.chunkCount} chunk{doc.chunkCount === 1 ? "" : "s"}
              {doc.error ? ` · ${doc.error}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {doc.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                disabled={pendingId === doc.id}
                onClick={() => onReindex(doc.id)}
              >
                Re-index
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              disabled={pendingId === doc.id}
              onClick={() => onDelete(doc.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
