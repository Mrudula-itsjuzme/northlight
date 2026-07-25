"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema, type ProductInput } from "@/lib/validation/products";
import { addProduct, importProductsCsv, type ImportProductsCsvResult } from "@/lib/onboarding/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CsvRowError } from "@/lib/csv/parse-products";
import { ErrorState } from "@/components/ui/error-state";
import { Package, Plus, UploadCloud, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";

export function ProductsStep({ brandId }: { brandId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [csvPending, setCsvPending] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportProductsCsvResult | null>(null);
  const [addedCount, setAddedCount] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
  });

  async function onSubmit(values: ProductInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await addProduct(brandId, values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setAddedCount((c) => c + 1);
      reset();
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setServerError(err instanceof Error ? err.message : "Failed to add product.");
    } finally {
      setPending(false);
    }
  }

  async function onCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvPending(true);
    setServerError(null);
    try {
      const text = await file.text();
      const result = await importProductsCsv(brandId, text);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setCsvResult(result.data);
      setAddedCount((c) => c + result.data.imported);
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setServerError(err instanceof Error ? err.message : "Failed to import CSV.");
    } finally {
      setCsvPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function continueToNextStep() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Add catalog items manually or import a product CSV (columns: name, sku, price, description, product_url).
      </p>

      {serverError && <ErrorState message={serverError} />}

      {/* Manual Product Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-md" noValidate>
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <Package className="h-4 w-4 text-violet-400" />
          <h4 className="text-sm font-bold text-foreground">Add Product Manually</h4>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-semibold">Product Name</Label>
          <Input id="name" placeholder="Organic Vitamin C Serum" {...register("name")} />
          {errors.name && <p className="text-xs text-rose-400 font-medium">{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sku" className="text-xs font-semibold">SKU</Label>
            <Input id="sku" placeholder="VIT-C-01" {...register("sku")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priceCents" className="text-xs font-semibold">Price (in cents)</Label>
            <Input id="priceCents" type="number" placeholder="2999" {...register("priceCents", { valueAsNumber: true })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="productUrl" className="text-xs font-semibold">Product URL</Label>
          <Input id="productUrl" placeholder="https://mystore.com/products/serum" {...register("productUrl")} />
        </div>

        <Button type="submit" variant="gradient" size="sm" className="gap-1.5" disabled={pending}>
          {pending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span>Add Product</span>
        </Button>
      </form>

      {/* CSV Import */}
      <div className="space-y-3 rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <UploadCloud className="h-4 w-4 text-cyan-400" />
          <h4 className="text-sm font-bold text-foreground">Import Catalog CSV</h4>
        </div>
        <input
          ref={fileInputRef}
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={onCsvChange}
          disabled={csvPending}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground cursor-pointer"
        />
        {csvResult && (
          <div className="text-xs space-y-2">
            <p className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Successfully imported {csvResult.imported} of {csvResult.totalRows} rows.
            </p>
            {csvResult.rowErrors.length > 0 && (
              <div className="space-y-1 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
                <p className="font-semibold">{csvResult.rowErrors.length} row(s) had errors:</p>
                <ul className="list-inside list-disc text-xs">
                  {csvResult.rowErrors.map((e: CsvRowError, i: number) => (
                    <li key={i}>
                      Row {e.row}: {e.errors.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs font-mono text-muted-foreground font-semibold">
          {addedCount} product(s) registered
        </p>
        <Button onClick={continueToNextStep} variant="gradient" className="shadow-glow gap-1.5">
          <span>Continue Step</span> <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
