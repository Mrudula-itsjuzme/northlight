import { getActiveBrandId } from "@/lib/brands/actions";
import { getDiagnosticsSummary } from "@/lib/diagnostics/telemetry";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Cpu, ShieldCheck, Zap, Database, CheckCircle2, AlertTriangle, Layers } from "lucide-react";

export default async function DiagnosticsPage() {
  const brandId = await getActiveBrandId();
  const summary = await getDiagnosticsSummary(brandId ?? undefined);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">
              Internal Diagnostics & Telemetry
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              <Activity className="h-3.5 w-3.5" /> System Healthy
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Real-time internal worker queue depth, LLM gateway token telemetry, and execution mode status.
          </p>
        </div>
      </div>

      {/* Top Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card glass className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Execution Mode</span>
            <Cpu className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold uppercase tracking-wide text-foreground">
              {summary.executionMode}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {summary.openAiKeyConfigured ? "OpenAI Configured" : "No Live Key"}
            </span>
          </div>
        </Card>

        <Card glass className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">LLM Tokens Consumed</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-foreground">
              {summary.llmTelemetry.totalTokens.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              ${(summary.llmTelemetry.totalCostCents / 100).toFixed(4)} est.
            </span>
          </div>
        </Card>

        <Card glass className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Queued Jobs</span>
            <Layers className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-foreground">
              {summary.workerQueue.queued}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary.workerQueue.running} active running
            </span>
          </div>
        </Card>

        <Card glass className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Completed Jobs</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-foreground">
              {summary.workerQueue.succeeded}
            </span>
            <span className="text-xs text-rose-400 font-medium">
              {summary.workerQueue.failed} failed
            </span>
          </div>
        </Card>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-400" /> Background Job Queue Health
            </CardTitle>
            <CardDescription>
              Postgres-native queue status (`SKIP LOCKED` lease recovery enabled).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm py-2 border-b border-border/40">
                <span className="text-muted-foreground">Queued (Pending Execution)</span>
                <span className="font-mono font-bold text-foreground">{summary.workerQueue.queued}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border/40">
                <span className="text-muted-foreground">Running (Leased by Worker)</span>
                <span className="font-mono font-bold text-amber-400">{summary.workerQueue.running}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border/40">
                <span className="text-muted-foreground">Succeeded</span>
                <span className="font-mono font-bold text-emerald-400">{summary.workerQueue.succeeded}</span>
              </div>
              <div className="flex justify-between text-sm py-2">
                <span className="text-muted-foreground">Failed</span>
                <span className="font-mono font-bold text-rose-400">{summary.workerQueue.failed}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Gateway & Infrastructure Telemetry
            </CardTitle>
            <CardDescription>
              Structured logging & execution environment audit details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="rounded-lg bg-background/60 p-4 border border-border/50 space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment:</span>
                <span className="text-foreground">{process.env.NODE_ENV ?? "development"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">AI Gateway Mode:</span>
                <span className="text-violet-400 font-bold">{summary.executionMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">OpenAI Key Status:</span>
                <span className={summary.openAiKeyConfigured ? "text-emerald-400" : "text-rose-400"}>
                  {summary.openAiKeyConfigured ? "Configured & Active" : "Missing (Fallback Active)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pipeline Steps Executed:</span>
                <span className="text-foreground">{summary.llmTelemetry.stepCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Usage Meter Events:</span>
                <span className="text-foreground">{summary.usageEventsCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
