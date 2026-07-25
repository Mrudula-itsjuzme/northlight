import { getActiveBrandId, isBrandDemo } from "@/lib/brands/actions";
import { listContentBriefs, listPipelineRuns } from "@/lib/content/actions";
import { listKeywords } from "@/lib/keywords/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import { BriefList } from "./brief-list";
import { GenerateBriefForm } from "./generate-brief-form";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  FileText,
  Sparkles,
  BookOpen,
  Target,
  PenTool,
  CheckCircle2,
  Search,
  CheckCheck,
  Code2,
} from "lucide-react";

const PIPELINE_STAGES = [
  { name: "Research", icon: BookOpen },
  { name: "Strategy", icon: Target },
  { name: "Outline", icon: FileText },
  { name: "Writer", icon: PenTool },
  { name: "Editor", icon: CheckCircle2 },
  { name: "SEO Optimizer", icon: Search },
  { name: "Fact Check", icon: CheckCheck },
  { name: "Schema", icon: Code2 },
];

export default async function ContentPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const [briefsResult, runsResult, keywordsResult, isDemo] = await Promise.all([
    listContentBriefs(brandId),
    listPipelineRuns(brandId),
    listKeywords(brandId, { pageSize: 100 }),
    isBrandDemo(brandId),
  ]);

  const briefs = briefsResult.ok ? briefsResult.data : [];
  const runs = runsResult.ok ? runsResult.data : [];
  const keywordOptions = keywordsResult.ok
    ? keywordsResult.data.items.map((k) => ({ id: k.id, term: k.term }))
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">8-Stage Content Pipeline</h1>
            {isDemo && <DataBadge kind="demo" />}
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Autonomous multi-stage generation engine that transforms high-priority keywords into fully optimized articles across 8 quality gates.
          </p>
        </div>
      </div>

      {/* 8-Stage Tracker Showcase Banner */}
      <Card glass className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-violet-400" /> Pipeline Stage Architecture
          </span>
          <span className="text-xs font-medium text-emerald-400">8 Quality Gates Active</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {PIPELINE_STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.name}
                className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/60 bg-card/50 text-center space-y-1.5 transition-all hover:border-primary/40 hover:bg-card/80"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-semibold text-foreground">{stage.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">Gate {idx + 1}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {!briefsResult.ok && <ErrorState message={briefsResult.error} />}

      {/* Brief Generator */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" /> Generate Content Brief
          </CardTitle>
          <CardDescription>
            Select a target keyword from your explorer to trigger an automated brief & article generation job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenerateBriefForm brandId={brandId} keywords={keywordOptions} />
        </CardContent>
      </Card>

      {/* Briefs List */}
      <Card glass>
        <CardHeader>
          <CardTitle>Content Briefs & In-Flight Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <BriefList brandId={brandId} briefs={briefs} runs={runs} />
        </CardContent>
      </Card>
    </div>
  );
}
