"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { seedDemoKeywords } from "@/lib/onboarding/actions";
import { Button } from "@/components/ui/button";

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
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We&apos;ll seed a handful of demo keywords with realistic volume,
        difficulty, and intent data so you can explore priority scoring
        immediately. You can add your own keywords or import a CSV anytime
        from the Keyword Explorer.
      </p>
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {seededCount !== null && (
        <div className="rounded-md bg-success/10 px-3 py-2 text-sm text-success-foreground">
          Seeded {seededCount} demo keywords.
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={onSeed} disabled={pending}>
          {pending ? "Seeding..." : "Seed demo keywords & finish"}
        </Button>
      </div>
    </div>
  );
}
