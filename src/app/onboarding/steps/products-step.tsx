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
      <p className="text-sm text-muted-foreground">
        Add at least one product manually or import a CSV
        (columns: name, sku, price, description, product_url).
      </p>

      {serverError && (
        <ErrorState message={serverError} />
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md border p-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Product name</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" {...register("sku")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priceCents">Price (cents)</Label>
            <Input id="priceCents" type="number" {...register("priceCents", { valueAsNumber: true })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="productUrl">Product URL</Label>
          <Input id="productUrl" {...register("productUrl")} />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding..." : "Add product"}
        </Button>
      </form>

      <div className="space-y-2 rounded-md border p-4">
        <Label htmlFor="csv">Or import a CSV</Label>
        <input
          ref={fileInputRef}
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={onCsvChange}
          disabled={csvPending}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        {csvResult && (
          <div className="text-sm">
            <p className="text-success-foreground">
              Imported {csvResult.imported} of {csvResult.totalRows} rows.
            </p>
            {csvResult.rowErrors.length > 0 && (
              <div className="mt-2 space-y-1 rounded-md bg-destructive/10 p-2 text-destructive">
                <p className="font-medium">{csvResult.rowErrors.length} row(s) had errors:</p>
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{addedCount} product(s) added this session.</p>
        <Button onClick={continueToNextStep}>Continue</Button>
      </div>
    </div>
  );
}
