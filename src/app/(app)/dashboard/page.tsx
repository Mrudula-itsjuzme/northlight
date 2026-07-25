import Link from "next/link";
import {
  FileText,
  Search,
  Eye,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  Sparkles,
  BarChart3,
  Clock,
  Compass,
} from "lucide-react";
import { getActiveBrandId } from "@/lib/brands/actions";
import { getAnalyticsSnapshot } from "@/lib/analytics/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const result = await getAnalyticsSnapshot(brandId);

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">Growth Control Center</h1>
            {result.ok && result.data.isDemoBrand && <DataBadge kind="demo" />}
          </div>
          <p className="text-sm text-muted-foreground">
            Real-time performance intelligence, AI visibility indexes, and priority growth actions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/analytics" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>Full Analytics</span>
            </Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/recommendations" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              <span>View Action Items</span>
            </Link>
          </Button>
        </div>
      </div>

      {!result.ok && <ErrorState message={result.error} />}

      {result.ok && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Articles */}
          <Card glass className="relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileText className="h-20 w-20 text-violet-500" />
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Articles Published
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                  <FileText className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-foreground">{result.data.articles.published}</p>
                <span className="text-xs font-medium text-muted-foreground">
                  / {result.data.articles.generated} generated
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                  style={{
                    width: result.data.articles.generated
                      ? `${(result.data.articles.published / result.data.articles.generated) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Keyword Coverage */}
          <Card glass className="relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Search className="h-20 w-20 text-cyan-500" />
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Keyword Coverage
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                  <Search className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-foreground">
                  {(result.data.keywords.coverageRatio * 100).toFixed(0)}%
                </p>
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3" /> Active
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full"
                  style={{ width: `${result.data.keywords.coverageRatio * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {result.data.keywords.covered} of {result.data.keywords.total} keywords mapped to briefs
              </p>
            </CardContent>
          </Card>

          {/* Card 3: AI Visibility */}
          <Card glass className="relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Eye className="h-20 w-20 text-emerald-500" />
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Visibility Rate
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Eye className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-foreground">
                  {result.data.visibility.overallMentionRate === null
                    ? "N/A"
                    : `${(result.data.visibility.overallMentionRate * 100).toFixed(0)}%`}
                </p>
                <span className="text-xs font-semibold text-emerald-400">Target 80%+</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
                  style={{
                    width: result.data.visibility.overallMentionRate
                      ? `${result.data.visibility.overallMentionRate * 100}%`
                      : "0%",
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Directional answer mention rate across AI platforms</p>
            </CardContent>
          </Card>

          {/* Card 4: Open Recommendations */}
          <Card glass className="relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Lightbulb className="h-20 w-20 text-amber-500" />
            </div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Open Recommendations
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <Lightbulb className="h-4 w-4" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-foreground">
                  {result.data.recommendations.total - result.data.recommendations.done}
                </p>
                <span className="text-xs font-medium text-amber-400 flex items-center gap-0.5">
                  <Clock className="h-3 w-3" /> Priority
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-400 rounded-full"
                  style={{
                    width: result.data.recommendations.total
                      ? `${
                          ((result.data.recommendations.total - result.data.recommendations.done) /
                            result.data.recommendations.total) *
                          100
                        }%`
                      : "0%",
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {result.data.recommendations.done} of {result.data.recommendations.total} tasks completed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Navigation Launchpad */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" /> Growth Navigation Launchpad
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/content"
            className="group rounded-xl border border-border/80 glass-card p-5 space-y-3 transition-all duration-300 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 group-hover:scale-110 transition-transform">
                <FileText className="h-5 w-5" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-violet-400 transition-colors">
                Content Pipeline
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Run articles through 8 quality gates: brief, draft, GEO optimization, and AI readiness.
              </p>
            </div>
          </Link>

          <Link
            href="/visibility"
            className="group rounded-xl border border-border/80 glass-card p-5 space-y-3 transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:scale-110 transition-transform">
                <Eye className="h-5 w-5" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                AI Visibility Radar
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Track how ChatGPT, Claude, Perplexity, Gemini, and Copilot answer queries for your brand.
              </p>
            </div>
          </Link>

          <Link
            href="/competitors"
            className="group rounded-xl border border-border/80 glass-card p-5 space-y-3 transition-all duration-300 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 group-hover:scale-110 transition-transform">
                <Search className="h-5 w-5" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                Competitor Intelligence
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Spot rival content gaps, missing product queries, and uncaptured search opportunities.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
