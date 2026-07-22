"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataBadge } from "@/components/ui/data-badge";
import type { AnalyticsSnapshot } from "@/lib/analytics/queries";

function StatTile({
  label,
  value,
  provenance,
  helpText,
}: {
  label: string;
  value: string;
  provenance: "live" | "estimated" | "demo";
  helpText?: string;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <DataBadge kind={provenance} />
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {helpText && <p className="mt-1 text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  review: "Review",
  approved: "Approved",
  published: "Published",
};

export function AnalyticsCharts({ data }: { data: AnalyticsSnapshot }) {
  const statusData = Object.entries(data.articles.statusBreakdown).map(([status, count]) => ({
    status: STATUS_LABELS[status] ?? status,
    count,
  }));

  const velocityData = data.articles.velocityByWeek;

  const visibilityByWeek = new Map<string, { week: string; mentionRate: number }>();
  for (const row of data.visibility.trendByWeek) {
    const existing = visibilityByWeek.get(row.week);
    if (!existing) {
      visibilityByWeek.set(row.week, { week: row.week, mentionRate: row.mentionRate });
    } else {
      existing.mentionRate = (existing.mentionRate + row.mentionRate) / 2;
    }
  }
  const visibilityData = Array.from(visibilityByWeek.values()).sort((a, b) =>
    a.week < b.week ? -1 : a.week > b.week ? 1 : 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Articles generated"
          value={String(data.articles.generated)}
          provenance="live"
        />
        <StatTile
          label="Articles published"
          value={String(data.articles.published)}
          provenance="live"
        />
        <StatTile
          label="Median time to first publish"
          value={
            data.articles.medianTimeToFirstPublishHours === null
              ? "N/A"
              : `${data.articles.medianTimeToFirstPublishHours.toFixed(1)}h`
          }
          provenance="live"
          helpText="Median hours from article creation to first publish."
        />
        <StatTile
          label="Estimated AI cost"
          value={`$${data.cost.estimatedUsd.toFixed(2)}`}
          provenance="estimated"
          helpText={`${data.cost.totalTokens.toLocaleString()} tokens across ${data.cost.completedRunCount} completed pipeline runs.`}
        />
        <StatTile
          label="Keyword coverage"
          value={`${data.keywords.covered}/${data.keywords.total}`}
          provenance="live"
          helpText={`${(data.keywords.coverageRatio * 100).toFixed(0)}% of keywords have a linked content brief.`}
        />
        <StatTile
          label="Avg. keyword priority"
          value={
            data.keywords.averagePriorityScore === null
              ? "N/A"
              : data.keywords.averagePriorityScore.toFixed(2)
          }
          provenance="live"
        />
        <StatTile
          label="AI visibility mention rate"
          value={
            data.visibility.overallMentionRate === null
              ? "N/A"
              : `${(data.visibility.overallMentionRate * 100).toFixed(0)}%`
          }
          provenance="estimated"
          helpText={`Directional proxy only, never an official citation count. ${data.visibility.totalSnapshots} snapshots observed.`}
        />
        <StatTile
          label="Recommendations completed"
          value={`${data.recommendations.done}/${data.recommendations.total}`}
          provenance="live"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Content velocity</CardTitle>
            <CardDescription>Articles published per week.</CardDescription>
          </CardHeader>
          <CardContent>
            {velocityData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No published articles yet — publish an article to see velocity here.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Published" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Article statuses</CardTitle>
            <CardDescription>Current lifecycle breakdown across all articles.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI visibility trend</CardTitle>
              <DataBadge kind="estimated" />
            </div>
            <CardDescription>
              Average mention rate per week across tracked prompts/platforms.
              Directional only — never an official citation count.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {visibilityData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visibility snapshots yet — run a snapshot on the AI Visibility page.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={visibilityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                  <Line type="monotone" dataKey="mentionRate" name="Mention rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Traffic (last 30 days)</CardTitle>
              <DataBadge kind="demo" />
            </div>
            <CardDescription>
              No organic/AI-referral analytics integration is configured in
              this environment — these figures are deterministic demo
              placeholders, not real traffic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Organic sessions
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {data.demoTraffic.organicSessionsLast30d.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AI-referral sessions
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {data.demoTraffic.aiReferralSessionsLast30d.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
