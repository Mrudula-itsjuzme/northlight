"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keywordSchema, type KeywordInput } from "@/lib/validation/keywords";
import { createKeyword } from "@/lib/keywords/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Plus, Sparkles } from "lucide-react";

export function AddKeywordForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<KeywordInput>({
    resolver: zodResolver(keywordSchema),
    defaultValues: {
      rawVolume: 0,
      rawDifficulty: 0,
      rawCommercialIntent: 0,
      rawTrend: 0,
      rawBusinessValue: 0,
    },
  });

  async function onSubmit(values: KeywordInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await createKeyword(brandId, values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      reset();
      router.refresh();
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "Failed to add keyword.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="term" className="text-xs font-semibold">Target Keyword Term</Label>
        <Input id="term" placeholder="e.g. best organic eye cream" {...register("term")} />
        {errors.term && <p className="text-xs text-rose-400 font-medium">{errors.term.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rawVolume" className="text-xs font-semibold">Search Volume</Label>
          <Input id="rawVolume" type="number" placeholder="12500" {...register("rawVolume", { valueAsNumber: true })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rawDifficulty" className="text-xs font-semibold">Difficulty (0-100)</Label>
          <Input id="rawDifficulty" type="number" placeholder="42" {...register("rawDifficulty", { valueAsNumber: true })} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rawCommercialIntent" className="text-xs font-semibold">Intent (0-1)</Label>
          <Input
            id="rawCommercialIntent"
            type="number"
            step="0.1"
            placeholder="0.8"
            {...register("rawCommercialIntent", { valueAsNumber: true })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rawTrend" className="text-xs font-semibold">Trend Velocity (0-1)</Label>
          <Input id="rawTrend" type="number" step="0.1" placeholder="0.9" {...register("rawTrend", { valueAsNumber: true })} />
        </div>
      </div>

      <Button type="submit" variant="gradient" size="sm" className="w-full gap-1.5 shadow-glow" disabled={pending}>
        {pending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        <span>Add & Score Keyword</span>
      </Button>
    </form>
  );
}
