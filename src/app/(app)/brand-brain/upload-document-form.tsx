"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadBrandDocument } from "@/lib/brand-brain/actions";
import { ErrorState } from "@/components/ui/error-state";

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
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <ErrorState message={error} />
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.csv,.pdf,.docx"
        onChange={onFileChange}
        disabled={pending}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      {pending && <p className="text-xs text-muted-foreground">Uploading and extracting text...</p>}
    </div>
  );
}
