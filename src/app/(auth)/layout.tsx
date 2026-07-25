import Link from "next/link";
import { Sparkles, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background bg-mesh-pattern p-4 sm:p-6 lg:p-8">
      {/* Glow Backdrop */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-violet-600/20 via-purple-600/10 to-cyan-500/20 blur-3xl opacity-60" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 via-purple-600 to-cyan-500 text-white shadow-glow transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-gradient-purple">Northlight</span>
          </Link>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            AI Growth OS for D2C Brands
          </p>
        </div>

        {/* Card Container */}
        <div className="glass-card rounded-2xl border border-white/10 p-2 shadow-2xl shadow-violet-500/10">
          {children}
        </div>

        {/* Trust Footer */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Tenant Isolated via Supabase RLS & Encrypted Auth</span>
        </div>
      </div>
    </div>
  );
}
