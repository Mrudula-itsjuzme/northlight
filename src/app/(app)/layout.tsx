import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, ShieldCheck } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-background bg-mesh-pattern lg:flex-row">
      <MobileNav email={user.email ?? null} brands={brands} activeBrandId={activeBrandId} />
      
      {/* Sleek Control Tower Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border/80 glass-panel p-5 lg:flex">
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-purple-600 to-cyan-500 text-white shadow-glow-sm transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-gradient-purple">Northlight</span>
              <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                AI Growth OS
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 text-[10px] font-semibold text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </div>
        </div>

        {/* Brand Switcher Container */}
        <div className="mb-5 rounded-xl border border-border/60 bg-card/60 p-2 backdrop-blur-sm shadow-sm">
          <div className="mb-1.5 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Active Brand Context
          </div>
          <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        </div>

        {/* Navigation items */}
        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav />
        </div>

        {/* Security & System Info Footer */}
        <div className="mt-4 rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground space-y-2 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Tenant Isolation
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/80">RLS Active</span>
          </div>
        </div>

        {/* User Menu */}
        <div className="mt-4 border-t border-border/60 pt-4">
          <UserMenu email={user.email ?? null} />
        </div>
      </aside>

      {/* Main Page Canvas */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-8 animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  );
}
