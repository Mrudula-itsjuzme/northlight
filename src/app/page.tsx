import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Eye,
  Radar,
  Search,
  FileText,
  Lightbulb,
  Brain,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-background bg-mesh-pattern text-foreground overflow-hidden">
      {/* Background Glow Mesh Orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-tr from-violet-600/15 via-purple-600/10 to-cyan-500/15 blur-3xl opacity-70" />

      {/* Top Header Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-purple-600 to-cyan-500 text-white shadow-glow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gradient-purple">Northlight</span>
        </Link>

        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/signup" className="flex items-center gap-1.5">
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-12 pb-24 lg:px-8 lg:pt-20">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-400 shadow-glow-sm animate-fade-in-up">
            <Sparkles className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
            <span>AI Growth OS for D2C Brands</span>
            <span className="h-1 w-1 rounded-full bg-violet-400" />
            <span className="text-violet-300">v1.0 Live</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] text-balance">
            Dominate AI Search Answers & Scale Your{" "}
            <span className="text-gradient-purple">D2C Brand</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto text-balance">
            The all-in-one platform for keyword discovery, competitor gap analysis, automated content pipeline generation, and AI visibility tracking across ChatGPT, Claude, Gemini, and Perplexity.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button asChild variant="gradient" size="lg" className="w-full sm:w-auto shadow-glow">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span>Launch Growth OS</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/login">
                <span>Explore Demo Brand</span>
              </Link>
            </Button>
          </div>

          {/* AI Platforms Ticker */}
          <div className="pt-10 border-t border-border/40 max-w-3xl mx-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
              Tracked Across Leading AI Assistant Search Engines
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-muted-foreground/80">
              <span className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Zap className="h-4 w-4 text-emerald-400" /> ChatGPT</span>
              <span className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Zap className="h-4 w-4 text-purple-400" /> Claude</span>
              <span className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Zap className="h-4 w-4 text-cyan-400" /> Gemini</span>
              <span className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Zap className="h-4 w-4 text-amber-400" /> Perplexity</span>
              <span className="flex items-center gap-1.5 hover:text-foreground transition-colors"><Zap className="h-4 w-4 text-pink-400" /> Copilot</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive Preview Card */}
        <div className="mt-16 relative mx-auto max-w-5xl rounded-2xl border border-white/10 glass-card p-6 shadow-2xl shadow-violet-500/10">
          <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-rose-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ml-3 text-xs font-mono text-muted-foreground">northlight.app/dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Demo Active
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Widget 1 */}
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>AI Visibility Index</span>
                <Eye className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">84.2%</span>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3" /> +12.4%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full w-[84%]" />
              </div>
            </div>

            {/* Widget 2 */}
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Competitor Content Gaps</span>
                <Radar className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">18 High ROI</span>
              </div>
              <p className="text-xs text-muted-foreground">Unclaimed high-intent keyword opportunities spotted.</p>
            </div>

            {/* Widget 3 */}
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Content Pipeline</span>
                <FileText className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">8 Stage Gate</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => (
                  <div
                    key={step}
                    className={`h-2 flex-1 rounded-full ${
                      step <= 6 ? "bg-emerald-500" : step === 7 ? "bg-amber-500 animate-pulse" : "bg-secondary"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="mt-28 space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight">Built Specifically for High-Growth Brands</h2>
            <p className="text-muted-foreground">Everything you need to turn AI answer engines into your highest-converting growth channel.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-violet-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">Keyword Explorer</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Discover high-value D2C keywords, analyze search intent, and target untapped product opportunities.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-cyan-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                <Radar className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">Competitor Radar</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Map rival content strategies and isolate exact content gaps to capture early rank advantage.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-emerald-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">8-Stage Content Pipeline</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                From brief generation to GEO/SEO optimization and publish quality verification gates.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-amber-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <Eye className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">AI Visibility Tracking</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Monitor your brand&apos;s mention share across ChatGPT, Claude, Perplexity, Gemini, and Copilot.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-purple-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
                <Brain className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">Brand Brain Context</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Store product catalog knowledge and brand guidelines for ultra-accurate, context-aware AI outputs.
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 glass-card p-6 space-y-3 hover:border-rose-500/40 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
                <Lightbulb className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">ROI Recommendations</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Get a ranked daily list of high-impact actions to maximize visibility and revenue growth.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 Northlight Growth OS. All rights reserved. Multi-Tenant Protected by Supabase RLS.</p>
      </footer>
    </div>
  );
}
