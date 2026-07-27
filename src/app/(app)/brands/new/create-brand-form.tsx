"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBrandSchema, type CreateBrandInput } from "@/lib/validation/brands";
import { createBrand, switchActiveBrand } from "@/lib/brands/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Building2, Tag, Globe, Sparkles, ArrowRight } from "lucide-react";

export function CreateBrandForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateBrandInput>({
    resolver: zodResolver(createBrandSchema),
  });

  async function onSubmit(values: CreateBrandInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await createBrand(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      await switchActiveBrand(result.data.brandId);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "Failed to create brand.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Brand Name
        </Label>
        <Input id="name" placeholder="e.g. Acme Health" {...register("name")} />
        {errors.name && <p className="text-xs text-rose-400 font-medium">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vertical" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" /> Industry / Vertical
        </Label>
        <Input id="vertical" placeholder="e.g. Skincare, SaaS, E-commerce" {...register("vertical")} />
        {errors.vertical && <p className="text-xs text-rose-400 font-medium">{errors.vertical.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="websiteUrl" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Website URL
        </Label>
        <Input id="websiteUrl" placeholder="https://example.com" {...register("websiteUrl")} />
        {errors.websiteUrl && <p className="text-xs text-rose-400 font-medium">{errors.websiteUrl.message}</p>}
      </div>

      <Button type="submit" variant="gradient" className="w-full shadow-glow gap-2" disabled={pending}>
        {pending ? (
          <>
            <Sparkles className="h-4 w-4 animate-spin" /> Provisioning Workspace...
          </>
        ) : (
          <>
            <span>Create Brand Workspace</span> <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
