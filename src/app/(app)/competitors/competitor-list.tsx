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

const GAP_TYPE_LABEL: Record<string, string> = {
  content: "Content",
  schema: "Schema",
  faq: "FAQ",
  backlink: "Backlink",
  ai_citation: "AI Citation",
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
    return <p className="text-sm text-muted-foreground">No competitors added yet.</p>;
  }

  return (
    <div className="divide-y">
      {competitors.map((competitor) => {
        const reports = gapReports.filter((r) => r.competitorId === competitor.id);
        const isExpanded = expandedId === competitor.id;

        return (
          <div key={competitor.id} className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{competitor.name}</p>
                <p className="text-xs text-muted-foreground">
                  {competitor.domain} · {competitor.pageCount} page(s) tracked ·{" "}
                  {competitor.gapReportCount} gap report(s)
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === competitor.id}
                  onClick={() => onGenerateGapReports(competitor.id)}
                >
                  Generate gap reports
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExpandedId(isExpanded ? null : competitor.id)}
                >
                  {isExpanded ? "Hide" : "View"} reports
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pendingId === competitor.id}
                  onClick={() => onDelete(competitor.id)}
                >
                  Delete
                </Button>
              </div>
            </div>

            {isExpanded && (
              <div className="mt-3 space-y-2">
                {reports.length === 0 && (
                  <p className="text-sm text-muted-foreground">No gap reports yet.</p>
                )}
                {reports.map((report) => {
                  const findings = (report.findings as { items?: Array<{ title: string; description: string; severity: string }> })?.items ?? [];
                  return (
                    <div key={report.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {GAP_TYPE_LABEL[report.type] ?? report.type}
                        </p>
                        <div className="flex items-center gap-2">
                          {report.isDemo && (
                            <span className="rounded bg-demo/10 px-1.5 py-0.5 text-xs font-medium text-demo">
                              Demo
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            priority {report.priorityScore?.toFixed(2) ?? "—"}
                          </span>
                        </div>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {findings.map((f, i) => (
                          <li key={i}>
                            <span className="font-medium text-foreground">{f.title}</span> —{" "}
                            {f.description} <span className="italic">({f.severity})</span>
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
