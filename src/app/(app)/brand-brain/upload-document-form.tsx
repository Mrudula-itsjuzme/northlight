"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadBrandDocument } from "@/lib/brand-brain/actions";
import { ErrorState } from "@/components/ui/error-state";
import { UploadCloud, Sparkles } from "lucide-react";

export function UploadDocumentForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await uploadBrandDocument(brandId, file.name, buffer);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      <div
        onClick={() => !pending && inputRef.current?.click()}
        className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-card/40 p-8 text-center cursor-pointer transition-all duration-300 hover:border-primary/50 hover:bg-card/70 hover:shadow-lg hover:shadow-primary/5"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,.pdf,.docx"
          onChange={onFileChange}
          disabled={pending}
          className="hidden"
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-glow-sm transition-transform duration-300 group-hover:scale-110">
          {pending ? (
            <Sparkles className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-7 w-7 text-primary" />
          )}
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-base font-semibold text-foreground">
            {pending ? "Extracting & Chunking Document..." : "Click or drag document to upload"}
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: TXT, CSV, PDF, or DOCX (max 10MB)
          </p>
        </div>

        {pending && (
          <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium animate-pulse">
            <Sparkles className="h-4 w-4" /> Generating vector embeddings for Brand Brain...
          </div>
        )}
      </div>
    </div>
  );
}
