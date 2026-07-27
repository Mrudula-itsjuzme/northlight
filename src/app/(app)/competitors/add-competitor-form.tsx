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
import { isRedirectError } from "@/lib/utils";
import { Plus, Sparkles, Globe, Building2 } from "lucide-react";

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
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "Failed to add competitor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Brand / Company Name
          </Label>
          <Input id="name" placeholder="Rival Brand Co." {...register("name")} />
          {errors.name && <p className="text-xs text-rose-400 font-medium">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="domain" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Domain
          </Label>
          <Input id="domain" placeholder="rivalbrand.com" {...register("domain")} />
          {errors.domain && <p className="text-xs text-rose-400 font-medium">{errors.domain.message}</p>}
        </div>
      </div>

      <Button type="submit" variant="gradient" size="sm" className="gap-1.5 shadow-glow" disabled={pending}>
        {pending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        <span>Add & Register Competitor</span>
      </Button>
    </form>
  );
}
