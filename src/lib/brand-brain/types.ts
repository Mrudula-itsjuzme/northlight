export const BRAND_DOCUMENTS_STORAGE_BUCKET = "brand-documents";

export type BrandDocumentSummary = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
};
