"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBriefForKeyword } from "@/lib/content/actions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Sparkles, FilePlus } from "lucide-react";

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
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to generate brief.");
    } finally {
      setPending(false);
    }
  }

  if (keywords.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Add target keywords in the Keyword Explorer first, then return here to generate an AI content brief.
      </p>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      {error && <ErrorState message={error} className="w-full" />}
      <select
        value={keywordId}
        onChange={(e) => setKeywordId(e.target.value)}
        className="h-10 rounded-xl border border-border/80 bg-background/80 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer flex-1"
      >
        {keywords.map((kw) => (
          <option key={kw.id} value={kw.id}>
            Keyword: &ldquo;{kw.term}&rdquo;
          </option>
        ))}
      </select>
      <Button
        onClick={onGenerate}
        disabled={pending}
        variant="gradient"
        size="sm"
        className="shrink-0 gap-1.5 shadow-glow"
      >
        {pending ? (
          <>
            <Sparkles className="h-4 w-4 animate-spin" /> Generating...
          </>
        ) : (
          <>
            <FilePlus className="h-4 w-4" /> Generate Brief
          </>
        )}
      </Button>
    </div>
  );
}
