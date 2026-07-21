"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storeSchema, type StoreInput } from "@/lib/validation/products";
import { addStore } from "@/lib/onboarding/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function StoreStep({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StoreInput>({
    resolver: zodResolver(storeSchema),
    defaultValues: { platform: "shopify" },
  });

  async function onSubmit(values: StoreInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await addStore(brandId, values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Tell us where your store lives so we can tailor recommendations.
      </p>
      {serverError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="platform">Platform</Label>
        <Input id="platform" placeholder="shopify, woocommerce, custom..." {...register("platform")} />
        {errors.platform && (
          <p className="text-xs text-destructive">{errors.platform.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="storeUrl">Store URL (optional)</Label>
        <Input id="storeUrl" placeholder="https://mystore.com" {...register("storeUrl")} />
        {errors.storeUrl && (
          <p className="text-xs text-destructive">{errors.storeUrl.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}
