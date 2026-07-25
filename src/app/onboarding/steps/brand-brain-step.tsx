"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, Sparkles } from "lucide-react";

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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your brand documents have been queued for automated chunking and vector embedding into Brand Brain.
      </p>

      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 space-y-2 backdrop-blur-md">
        <div className="flex items-center gap-2 text-violet-400 font-bold text-sm">
          <Brain className="h-4 w-4" /> Vector Indexing Pipeline Enqueued
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          Brand ID: <span className="text-foreground">{brandId}</span> — Jobs enqueued with type{" "}
          <span className="text-cyan-400">embed_brand_document</span>.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onContinue} disabled={pending} variant="gradient" className="shadow-glow gap-1.5">
          {pending ? <Sparkles className="h-4 w-4 animate-spin" /> : <span>Continue to Keywords</span>}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
