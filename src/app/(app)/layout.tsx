import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBrandsForUser, getActiveBrandId } from "@/lib/brands/actions";
import { BrandSwitcher } from "@/components/brands/brand-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const brandsResult = await listBrandsForUser();
  const brands = brandsResult.ok ? brandsResult.data : [];
  const activeBrandId = await getActiveBrandId();

  if (brands.length === 0) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <MobileNav email={user.email ?? null} brands={brands} activeBrandId={activeBrandId} />
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card p-4 lg:flex">
        <div className="mb-6 text-lg font-bold tracking-tight">Northlight</div>
        <div className="mb-6">
          <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        </div>
        <div className="flex-1">
          <SidebarNav />
        </div>
        <div className="mt-6 border-t pt-4">
          <UserMenu email={user.email ?? null} />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
