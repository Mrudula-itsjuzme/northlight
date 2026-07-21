import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBrandsForUser } from "@/lib/brands/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateBrandForm } from "@/app/(app)/brands/new/create-brand-form";

/**
 * Placeholder onboarding entry point for Phase 2 (auth + brands only). The
 * full multi-step wizard (account -> brand details -> store details ->
 * products -> CSV import -> brand documents -> Brand Brain indexing -> demo
 * keyword seed -> dashboard) lands in Phase 3 and will replace this page's
 * content while keeping this route.
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
  if (brandsResult.ok && brandsResult.data.length > 0) {
    redirect("/dashboard");
  }

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
            The full onboarding wizard (store, products, brand documents,
            demo keywords) is being built out in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBrandForm />
        </CardContent>
      </Card>
    </div>
  );
}
