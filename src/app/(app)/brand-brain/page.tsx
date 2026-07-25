import { getActiveBrandId } from "@/lib/brands/actions";
import { listBrandDocuments } from "@/lib/brand-brain/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadDocumentForm } from "./upload-document-form";
import { DocumentList } from "./document-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Brain, Sparkles, Database } from "lucide-react";

export default async function BrandBrainPage() {
  const brandId = await getActiveBrandId();

  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const result = await listBrandDocuments(brandId);
  const documents = result.ok ? result.data : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">Brand Brain Knowledge Base</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-semibold text-violet-400 border border-violet-500/20">
              <Brain className="h-3.5 w-3.5" /> Vector Indexed
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Store product catalog knowledge, brand guidelines, and tone documents to power context-aware content pipelines and recommendations.
          </p>
        </div>
      </div>

      {!result.ok && <ErrorState message={result.error} />}

      {/* Upload Box */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" /> Ingest Knowledge Document
          </CardTitle>
          <CardDescription>
            Upload product specs, brand guidelines, or marketing briefs for automated chunking & vector embedding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDocumentForm brandId={brandId} />
        </CardContent>
      </Card>

      {/* Indexed Documents List */}
      <Card glass>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-cyan-400" /> Indexed Knowledge Files ({documents.length})
            </CardTitle>
            <span className="text-xs font-mono text-muted-foreground">
              {process.env.OPENAI_API_KEY ? "OpenAI text-embedding-3-small" : "Deterministic Demo Hash Adapter"}
            </span>
          </div>
          <CardDescription>
            All active documents parsed into chunks for pgvector semantic search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentList brandId={brandId} documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
