"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBriefForKeyword } from "@/lib/content/actions";
import { Button } from "@/components/ui/button";

export function GenerateBriefForm({
  brandId,
  keywords,
}: {
  brandId: string;
  keywords: Array<{ id: string; term: string }>;
}) {
  const router = useRouter();
  const [keywordId, setKeywordId] = useState(keywords[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!keywordId) return;
    setPending(true);
    setError(null);
    try {
      const result = await createBriefForKeyword(brandId, keywordId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (keywords.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add keywords in the Keyword Explorer first, then generate a brief here.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <div className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <select
        value={keywordId}
        onChange={(e) => setKeywordId(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
      >
        {keywords.map((kw) => (
          <option key={kw.id} value={kw.id}>
            {kw.term}
          </option>
        ))}
      </select>
      <Button onClick={onGenerate} disabled={pending}>
        {pending ? "Generating..." : "Generate brief"}
      </Button>
    </div>
  );
}
