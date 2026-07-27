"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { seedDemoKeywords } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Sparkles, CheckCircle2, Rocket } from "lucide-react";

export function KeywordsStep({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededCount, setSeededCount] = useState<number | null>(null);

  async function onSeed() {
    setPending(true);
    setError(null);
    try {
      const result = await seedDemoKeywords(brandId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSeededCount(result.data.count);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (isRedirectError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to seed demo keywords.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        We&apos;ll seed demo keywords with realistic volume, difficulty, and commercial intent so you can explore priority scoring immediately.
      </p>

      {error && <ErrorState message={error} />}

      {seededCount !== null && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> Seeded {seededCount} demo keywords.
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onSeed} disabled={pending} variant="gradient" className="shadow-glow gap-2">
          {pending ? (
            <>
              <Sparkles className="h-4 w-4 animate-spin" /> Seeding Demo Keywords...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" /> Seed Demo Keywords & Launch Dashboard
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
