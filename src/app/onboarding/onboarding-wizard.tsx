import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { OnboardingState, OnboardingStep } from "@/lib/onboarding/state";
import { StoreStep } from "./steps/store-step";
import { ProductsStep } from "./steps/products-step";
import { DocumentsStep } from "./steps/documents-step";
import { BrandBrainStep } from "./steps/brand-brain-step";
import { KeywordsStep } from "./steps/keywords-step";
import { Sparkles, CheckCircle2 } from "lucide-react";

const STEP_LABELS: Record<OnboardingStep, string> = {
  brand: "Brand details",
  store: "Store details",
  products: "Products",
  documents: "Brand documents",
  "brand-brain": "Brand Brain indexing",
  keywords: "Demo keywords",
  done: "Done",
};

const STEP_ORDER: OnboardingStep[] = [
  "brand",
  "store",
  "products",
  "documents",
  "brand-brain",
  "keywords",
  "done",
];

export function OnboardingWizard({
  brandId,
  state,
}: {
  brandId: string;
  state: OnboardingState;
}) {
  const currentIndex = STEP_ORDER.indexOf(state.step);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Progress Track */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5 text-primary">
            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" /> Step {currentIndex} of {STEP_ORDER.length - 1}
          </span>
          <span className="text-foreground">{STEP_LABELS[state.step]}</span>
        </div>
        <div className="flex items-center gap-2">
          {STEP_ORDER.slice(1).map((step, i) => {
            const isDone = i < currentIndex - 1;
            const isCurrent = i === currentIndex - 1;
            return (
              <div
                key={step}
                className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                  isDone
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : isCurrent
                    ? "bg-gradient-to-r from-violet-500 to-cyan-400 shadow-glow-sm animate-pulse"
                    : "bg-secondary"
                }`}
                title={STEP_LABELS[step]}
              />
            );
          })}
        </div>
      </div>

      <Card glass className="shadow-2xl shadow-violet-500/10">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-gradient-purple">{STEP_LABELS[state.step]}</CardTitle>
              <CardDescription>Configure brand setup parameters to unlock AI Growth capabilities.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {state.step === "store" && <StoreStep brandId={brandId} />}
          {state.step === "products" && <ProductsStep brandId={brandId} />}
          {state.step === "documents" && <DocumentsStep brandId={brandId} />}
          {state.step === "brand-brain" && <BrandBrainStep brandId={brandId} />}
          {state.step === "keywords" && <KeywordsStep brandId={brandId} />}
        </CardContent>
      </Card>
    </div>
  );
}
