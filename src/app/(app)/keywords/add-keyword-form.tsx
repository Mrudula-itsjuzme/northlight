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
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {serverError && (
        <ErrorState message={serverError} />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="term">Term</Label>
        <Input id="term" {...register("term")} />
        {errors.term && <p className="text-xs text-destructive">{errors.term.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rawVolume">Volume</Label>
          <Input id="rawVolume" type="number" {...register("rawVolume", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rawDifficulty">Difficulty (0-100)</Label>
          <Input id="rawDifficulty" type="number" {...register("rawDifficulty", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rawCommercialIntent">Commercial intent (0-1)</Label>
          <Input
            id="rawCommercialIntent"
            type="number"
            step="0.1"
            {...register("rawCommercialIntent", { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rawTrend">Trend (0-1)</Label>
          <Input id="rawTrend" type="number" step="0.1" {...register("rawTrend", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rawBusinessValue">Business value (0-1)</Label>
          <Input
            id="rawBusinessValue"
            type="number"
            step="0.1"
            {...register("rawBusinessValue", { valueAsNumber: true })}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add keyword"}
      </Button>
    </form>
  );
}
