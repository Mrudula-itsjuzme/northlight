import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBrandsForUser, getActiveBrandId, switchActiveBrand } from "@/lib/brands/actions";
import { getOnboardingState } from "@/lib/onboarding/state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateBrandForm } from "@/app/(app)/brands/new/create-brand-form";
import { OnboardingWizard } from "./onboarding-wizard";

/**
 * Onboarding entry point. Reads the current step directly from persisted
 * data via getOnboardingState() (not client-side wizard state), so a
 * reload mid-wizard resumes at the correct step: account -> brand details
 * (handled by /brands/new's CreateBrandForm, reused here for a new user's
 * first brand) -> store -> products (manual + CSV) -> brand documents ->
 * Brand Brain indexing trigger -> demo keyword seed -> dashboard redirect.
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const brandsResult = await listBrandsForUser();
  const brands = brandsResult.ok ? brandsResult.data : [];

  if (brands.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold tracking-tight">Northlight</span>
          <p className="mt-1 text-sm text-muted-foreground">
            Let&apos;s set up your first brand.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create your brand</CardTitle>
            <CardDescription>
              You&apos;ll set up your store, products, and brand knowledge next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateBrandForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  let activeBrandId = await getActiveBrandId();
  const activeBrandIsMember = brands.some((b) => b.id === activeBrandId);
  if (!activeBrandId || !activeBrandIsMember) {
    activeBrandId = brands[0].id;
    await switchActiveBrand(activeBrandId);
  }

  const state = await getOnboardingState(activeBrandId);

  if (state.step === "done") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <span className="text-2xl font-bold tracking-tight">Northlight</span>
        <p className="mt-1 text-sm text-muted-foreground">
          Setting up {brands.find((b) => b.id === activeBrandId)?.name}
        </p>
      </div>
      <OnboardingWizard brandId={activeBrandId} state={state} />
    </div>
  );
}
