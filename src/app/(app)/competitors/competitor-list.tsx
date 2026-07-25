"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCompetitor,
  generateGapReportsForCompetitor,
  type CompetitorListItem,
  type GapReportItem,
} from "@/lib/competitors/actions";
import { Button } from "@/components/ui/button";
import { DataBadge } from "@/components/ui/data-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Radar, Globe, Sparkles, Trash2, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const GAP_TYPE_LABEL: Record<string, string> = {
  content: "Content Gaps",
  schema: "Schema & JSON-LD",
  faq: "FAQ & Answer Engine",
  backlink: "Backlink Overlap",
  ai_citation: "AI Answer Citations",
};

export function CompetitorList({
  brandId,
  competitors,
  gapReports,
}: {
  brandId: string;
  competitors: CompetitorListItem[];
  gapReports: GapReportItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function onDelete(competitorId: string) {
    setPendingId(competitorId);
    try {
      await deleteCompetitor(brandId, competitorId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function onGenerateGapReports(competitorId: string) {
    setPendingId(competitorId);
    try {
      await generateGapReportsForCompetitor(brandId, competitorId);
      setExpandedId(competitorId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (competitors.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No competitor domains tracked yet"
        description="Add a competitor above, then generate gap reports to uncover high-ROI content, schema, and AI-citation opportunities."
      />
    );
  }

  return (
    <div className="space-y-4">
      {competitors.map((competitor) => {
        const reports = gapReports.filter((r) => r.competitorId === competitor.id);
        const isExpanded = expandedId === competitor.id;

        return (
          <div
            key={competitor.id}
            className="rounded-2xl border border-border/80 bg-card/40 p-5 space-y-4 backdrop-blur-md transition-all hover:border-primary/30"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-bold text-base text-foreground flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  {competitor.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono bg-secondary/80 px-2 py-0.5 rounded text-foreground/90 font-medium">
                    {competitor.domain}
                  </span>
                  <span>•</span>
                  <span>{competitor.pageCount} pages tracked</span>
                  <span>•</span>
                  <span className="text-primary font-semibold">{competitor.gapReportCount} gap reports</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="gradient"
                  className="h-8 text-xs gap-1.5 shadow-glow"
                  disabled={pendingId === competitor.id}
                  onClick={() => onGenerateGapReports(competitor.id)}
                >
                  {pendingId === competitor.id ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 animate-spin" /> Scanning Domain...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> Run Gap Analysis
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => setExpandedId(isExpanded ? null : competitor.id)}
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>Reports</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs px-2"
                  disabled={pendingId === competitor.id}
                  onClick={() => onDelete(competitor.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Gap Reports Drawer */}
            {isExpanded && (
              <div className="mt-3 space-y-3 pt-2 border-t border-border/40">
                {reports.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No gap reports generated yet. Click &ldquo;Run Gap Analysis&rdquo; to generate instant findings.
                  </p>
                )}
                {reports.map((report) => {
                  const findings = (report.findings as { items?: Array<{ title: string; description: string; severity: string }> })?.items ?? [];
                  return (
                    <div
                      key={report.id}
                      className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3 shadow-inner"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Radar className="h-3.5 w-3.5 text-violet-400" />
                          {GAP_TYPE_LABEL[report.type] ?? report.type}
                        </p>
                        <div className="flex items-center gap-2">
                          {report.isDemo && <DataBadge kind="demo" className="px-1.5 py-0.5 text-[10px]" />}
                          <span className="text-[11px] font-mono text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded font-semibold">
                            Priority Score: {report.priorityScore?.toFixed(2) ?? "—"}
                          </span>
                        </div>
                      </div>

                      <ul className="space-y-2 text-xs">
                        {findings.map((f, i) => (
                          <li
                            key={i}
                            className="rounded-lg border border-border/40 bg-background/50 p-2.5 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> {f.title}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                  f.severity === "high"
                                    ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                                    : "bg-amber-500/15 text-amber-400 border border-amber-500/20",
                                )}
                              >
                                {f.severity}
                              </span>
                            </div>
                            <p className="text-muted-foreground leading-relaxed pl-5">{f.description}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
