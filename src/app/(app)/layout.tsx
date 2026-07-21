import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBrandsForUser, getActiveBrandId } from "@/lib/brands/actions";
import { BrandSwitcher } from "@/components/brands/brand-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";

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
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card p-4">
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
      <main className="flex-1 overflow-y-auto bg-background p-8">
        {children}
      </main>
    </div>
  );
}
