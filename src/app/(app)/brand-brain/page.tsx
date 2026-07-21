import { getActiveBrandId } from "@/lib/brands/actions";
import { listBrandDocuments } from "@/lib/brand-brain/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UploadDocumentForm } from "./upload-document-form";
import { DocumentList } from "./document-list";

export default async function BrandBrainPage() {
  const brandId = await getActiveBrandId();

  if (!brandId) {
    return <p className="text-muted-foreground">Select a brand to continue.</p>;
  }

  const result = await listBrandDocuments(brandId);
  const documents = result.ok ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brand Brain</h1>
        <p className="text-muted-foreground">
          Upload brand documents so Northlight can generate on-brand content
          and recommendations. Files are chunked and embedded for semantic
          retrieval — see the methodology note below for how embeddings are
          produced in this environment.
        </p>
      </div>

      {!result.ok && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload a document</CardTitle>
          <CardDescription>TXT, CSV, PDF, or DOCX.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDocumentForm brandId={brandId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indexed documents</CardTitle>
          <CardDescription>
            {process.env.OPENAI_API_KEY
              ? "Embeddings are generated with OpenAI text-embedding-3-small."
              : "No OPENAI_API_KEY configured — embeddings use a deterministic demo hash adapter (not real semantic similarity). See AI_SCORING.md."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentList brandId={brandId} documents={documents} />
        </CardContent>
      </Card>
    </div>
  );
}
