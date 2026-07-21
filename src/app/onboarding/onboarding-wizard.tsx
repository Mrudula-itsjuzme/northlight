import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { OnboardingState, OnboardingStep } from "@/lib/onboarding/state";
import { StoreStep } from "./steps/store-step";
import { ProductsStep } from "./steps/products-step";
import { DocumentsStep } from "./steps/documents-step";
import { BrandBrainStep } from "./steps/brand-brain-step";
import { KeywordsStep } from "./steps/keywords-step";

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
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-2">
        {STEP_ORDER.slice(1).map((step, i) => (
          <div
            key={step}
            className={`h-1.5 flex-1 rounded-full ${
              i <= currentIndex - 1 ? "bg-primary" : "bg-muted"
            }`}
            title={STEP_LABELS[step]}
          />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{STEP_LABELS[state.step]}</CardTitle>
          <CardDescription>Step {currentIndex} of {STEP_ORDER.length - 1}</CardDescription>
        </CardHeader>
        <CardContent>
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
