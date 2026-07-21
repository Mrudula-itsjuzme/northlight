"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * This step's "indexing" already happened at the data layer: adding a
 * brand document text in the previous step enqueued a real
 * `embed_brand_document` job (src/lib/onboarding/actions.ts). The worker
 * that processes that job (chunking + embeddings) lands in Phase 4/12 —
 * until it runs, documents sit in `pending`/`chunking`/`embedding` status,
 * which is a real, honest state, not a fake "indexed" label. This step is
 * a confirmation screen, not a second trigger.
 */
export function BrandBrainStep({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onContinue() {
    setPending(true);
    try {
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your brand documents have been queued for indexing (chunking +
        embedding) into Brand Brain. This runs in the background — you can
        keep going and check indexing status later from Brand Brain
        settings.
      </p>
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        Brand: <span className="font-mono">{brandId}</span> — documents
        queued via the <span className="font-mono">jobs</span> table
        (type <span className="font-mono">embed_brand_document</span>).
      </div>
      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={pending}>
          Continue
        </Button>
      </div>
    </div>
  );
}
