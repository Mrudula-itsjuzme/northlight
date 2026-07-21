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
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="name">Brand name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vertical">Vertical (optional)</Label>
        <Input id="vertical" placeholder="e.g. haircare" {...register("vertical")} />
        {errors.vertical && (
          <p className="text-xs text-destructive">{errors.vertical.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="websiteUrl">Website URL (optional)</Label>
        <Input id="websiteUrl" placeholder="https://example.com" {...register("websiteUrl")} />
        {errors.websiteUrl && (
          <p className="text-xs text-destructive">{errors.websiteUrl.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create brand"}
      </Button>
    </form>
  );
}
