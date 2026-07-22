"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  brandDocumentTextSchema,
  type BrandDocumentTextInput,
} from "@/lib/validation/products";
import { addBrandDocumentText, skipBrandDocuments } from "@/lib/onboarding/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export function DocumentsStep({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [skipPending, setSkipPending] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BrandDocumentTextInput>({
    resolver: zodResolver(brandDocumentTextSchema),
  });

  async function onSubmit(values: BrandDocumentTextInput) {
    setServerError(null);
    setPending(true);
    try {
      const result = await addBrandDocumentText(brandId, values);
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

  async function onContinue() {
    setSkipPending(true);
    try {
      if (addedCount === 0) {
        const result = await skipBrandDocuments(brandId);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }
      }
      router.refresh();
    } finally {
      setSkipPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Paste brand guidelines, FAQs, or product descriptions. Northlight
        will chunk and index this text (Brand Brain, next step) so content
        and recommendations stay on-brand. File upload (TXT/CSV/PDF/DOCX)
        is available from Brand Brain settings after onboarding.
      </p>

      {serverError && (
        <ErrorState message={serverError} />
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md border p-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="title">Document title</Label>
          <Input id="title" placeholder="Brand voice guidelines" {...register("title")} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rawText">Text</Label>
          <textarea
            id="rawText"
            rows={6}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            {...register("rawText")}
          />
          {errors.rawText && <p className="text-xs text-destructive">{errors.rawText.message}</p>}
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Add document"}
        </Button>
      </form>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{addedCount} document(s) added this session.</p>
        <Button onClick={onContinue} disabled={skipPending}>
          {addedCount > 0 ? "Continue" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
