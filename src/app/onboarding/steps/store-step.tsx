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
import { ErrorState } from "@/components/ui/error-state";
import { isRedirectError } from "@/lib/utils";
import { Store, Globe, ArrowRight, Sparkles } from "lucide-react";

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
    } catch (err) {
      if (isRedirectError(err)) return;
      setServerError(err instanceof Error ? err.message : "Failed to connect store.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Connect your e-commerce storefront platform to enable catalog syncing and product recommendations.
      </p>

      {serverError && <ErrorState message={serverError} />}

      <div className="space-y-1.5">
        <Label htmlFor="platform" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5 text-muted-foreground" /> E-commerce Platform
        </Label>
        <Input id="platform" placeholder="shopify, woocommerce, custom..." {...register("platform")} />
        {errors.platform && <p className="text-xs text-rose-400 font-medium">{errors.platform.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="storeUrl" className="text-xs font-semibold text-foreground/90 flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Storefront Domain / URL
        </Label>
        <Input id="storeUrl" placeholder="https://mystore.com" {...register("storeUrl")} />
        {errors.storeUrl && <p className="text-xs text-rose-400 font-medium">{errors.storeUrl.message}</p>}
      </div>

      <Button type="submit" variant="gradient" className="w-full shadow-glow" disabled={pending}>
        {pending ? (
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-spin" /> Saving Store Info...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Continue to Products <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </Button>
    </form>
  );
}
