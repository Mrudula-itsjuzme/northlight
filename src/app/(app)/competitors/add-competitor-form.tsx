"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { competitorSchema, type CompetitorInput } from "@/lib/validation/competitors";
import { createCompetitor } from "@/lib/competitors/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export function AddCompetitorForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompetitorInput>({ resolver: zodResolver(competitorSchema) });

  async function onSubmit(values: CompetitorInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await createCompetitor(brandId, values);
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      {serverError && <ErrorState message={serverError} className="w-full" />}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" placeholder="competitor.com" {...register("domain")} />
        {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add competitor"}
      </Button>
    </form>
  );
}
