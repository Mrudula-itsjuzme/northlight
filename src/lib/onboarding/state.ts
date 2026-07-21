import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stores, products, brandDocuments } from "@/db/schema";
import { keywords } from "@/db/schema";

export const ONBOARDING_STEPS = [
  "brand",
  "store",
  "products",
  "documents",
  "brand-brain",
  "keywords",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingState = {
  step: OnboardingStep;
  hasBrand: boolean;
  hasStore: boolean;
  hasProducts: boolean;
  hasDocuments: boolean;
  brandBrainIndexed: boolean;
  hasKeywords: boolean;
};

/**
 * Derives which onboarding step a brand is on directly from what's already
 * persisted, rather than trusting client-side wizard state. This means a
 * page reload (or resuming from a different device) always resumes at the
 * correct step: we don't track "wizard progress" as its own mutable field
 * that could drift from reality — the presence of real rows IS the
 * progress.
 */
export async function getOnboardingState(brandId: string): Promise<OnboardingState> {
  const db = getDb();

  const [storeRows, productRows, documentRows, keywordRows] = await Promise.all([
    db.select({ id: stores.id }).from(stores).where(eq(stores.brandId, brandId)).limit(1),
    db.select({ id: products.id }).from(products).where(eq(products.brandId, brandId)).limit(1),
    db
      .select({ id: brandDocuments.id, status: brandDocuments.status })
      .from(brandDocuments)
      .where(eq(brandDocuments.brandId, brandId)),
    db.select({ id: keywords.id }).from(keywords).where(eq(keywords.brandId, brandId)).limit(1),
  ]);

  const hasStore = storeRows.length > 0;
  const hasProducts = productRows.length > 0;
  const hasDocuments = documentRows.length > 0;
  const brandBrainIndexed =
    hasDocuments && documentRows.every((d) => d.status === "ready" || d.status === "failed");
  const hasKeywords = keywordRows.length > 0;

  let step: OnboardingStep = "brand";
  if (hasKeywords) step = "done";
  else if (brandBrainIndexed) step = "keywords";
  else if (hasDocuments) step = "brand-brain";
  else if (hasProducts) step = "documents";
  else if (hasStore) step = "products";
  else step = "store";

  return {
    step,
    hasBrand: true,
    hasStore,
    hasProducts,
    hasDocuments,
    brandBrainIndexed,
    hasKeywords,
  };
}
