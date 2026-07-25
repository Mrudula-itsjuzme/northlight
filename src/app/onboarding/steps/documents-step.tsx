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
import { FileText, Plus, ArrowRight, Sparkles } from "lucide-react";

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
    } catch (err) {
      if (typeof err === "object" && err !== null && "message" in err && String(err.message).includes("NEXT_REDIRECT")) {
        return;
      }
      setServerError(err instanceof Error ? err.message : "Failed to add document text.");
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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Paste brand voice guidelines, product specs, or FAQs to build your vector Brand Brain knowledge base.
      </p>

      {serverError && <ErrorState message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-border/80 bg-card/40 p-5 backdrop-blur-md" noValidate>
        <div className="flex items-center gap-2 border-b border-border/40 pb-3">
          <FileText className="h-4 w-4 text-violet-400" />
          <h4 className="text-sm font-bold text-foreground">Add Guideline / Text Document</h4>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs font-semibold">Document Title</Label>
          <Input id="title" placeholder="Brand Voice & Tone Guidelines" {...register("title")} />
          {errors.title && <p className="text-xs text-rose-400 font-medium">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rawText" className="text-xs font-semibold">Brand Knowledge Text</Label>
          <textarea
            id="rawText"
            rows={5}
            placeholder="Paste product messaging, tone rules, target ICP personas..."
            className="flex w-full rounded-xl border border-border/80 bg-background/60 px-3 py-2.5 text-xs shadow-inner placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary leading-relaxed"
            {...register("rawText")}
          />
          {errors.rawText && <p className="text-xs text-rose-400 font-medium">{errors.rawText.message}</p>}
        </div>

        <Button type="submit" variant="gradient" size="sm" className="gap-1.5" disabled={pending}>
          {pending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span>Add Brand Text</span>
        </Button>
      </form>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs font-mono text-muted-foreground font-semibold">
          {addedCount} document(s) added
        </p>
        <Button onClick={onContinue} disabled={skipPending} variant="gradient" className="shadow-glow gap-1.5">
          <span>{addedCount > 0 ? "Continue" : "Skip for now"}</span> <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
