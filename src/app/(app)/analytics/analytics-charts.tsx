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
    <div className="glass-card rounded-xl border border-border/80 p-5 space-y-2 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <DataBadge kind={provenance} />
      </div>
      <p className="text-3xl font-extrabold tracking-tight text-foreground">{value}</p>
      {helpText && <p className="text-xs text-muted-foreground/90 leading-relaxed">{helpText}</p>}
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
    <div className="space-y-8">
      {/* 8 Stat Tiles Matrix */}
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
          label="Time to first publish"
          value={
            data.articles.medianTimeToFirstPublishHours === null
              ? "N/A"
              : `${data.articles.medianTimeToFirstPublishHours.toFixed(1)}h`
          }
          provenance="live"
          helpText="Median hours from creation to first publish."
        />
        <StatTile
          label="Estimated AI cost"
          value={`$${data.cost.estimatedUsd.toFixed(2)}`}
          provenance="estimated"
          helpText={`${data.cost.totalTokens.toLocaleString()} tokens across ${data.cost.completedRunCount} runs.`}
        />
        <StatTile
          label="Keyword coverage"
          value={`${data.keywords.covered}/${data.keywords.total}`}
          provenance="live"
          helpText={`${(data.keywords.coverageRatio * 100).toFixed(0)}% of keywords mapped to briefs.`}
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
          label="AI mention rate"
          value={
            data.visibility.overallMentionRate === null
              ? "N/A"
              : `${(data.visibility.overallMentionRate * 100).toFixed(0)}%`
          }
          provenance="estimated"
          helpText={`Directional mention proxy (${data.visibility.totalSnapshots} snapshots).`}
        />
        <StatTile
          label="Recommendations done"
          value={`${data.recommendations.done}/${data.recommendations.total}`}
          provenance="live"
        />
      </div>

      {/* Recharts Data Visualization Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card glass>
          <CardHeader>
            <CardTitle>Content Velocity Trend</CardTitle>
            <CardDescription>Articles published per week across campaigns.</CardDescription>
          </CardHeader>
          <CardContent>
            {velocityData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No published articles yet — publish an article to see velocity trends here.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,160,175,0.15)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 15, 22, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      borderRadius: "12px",
                      color: "#fff",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    }}
                  />
                  <Bar dataKey="count" name="Published" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle>Article Status Breakdown</CardTitle>
            <CardDescription>Current stage distribution across all pipeline articles.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,160,175,0.15)" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 15, 22, 0.9)",
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    borderRadius: "12px",
                    color: "#fff",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  }}
                />
                <Bar dataKey="count" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI Visibility Mention Trend</CardTitle>
              <DataBadge kind="estimated" />
            </div>
            <CardDescription>
              Average mention rate over time across AI Search engines.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {visibilityData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No visibility snapshots yet — trigger a snapshot on the AI Visibility page.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={visibilityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,160,175,0.15)" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }} />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    tick={{ fontSize: 11, fill: "rgba(160,160,175,0.8)" }}
                  />
                  <Tooltip
                    formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                    contentStyle={{
                      backgroundColor: "rgba(15, 15, 22, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.15)",
                      borderRadius: "12px",
                      color: "#fff",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mentionRate"
                    name="Mention Rate"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: "#10b981", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Traffic Snapshot (30 Days)</CardTitle>
              <DataBadge kind="demo" />
            </div>
            <CardDescription>
              Deterministic organic and AI-referral sessions estimation model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Organic Sessions
                </p>
                <p className="text-3xl font-extrabold text-foreground">
                  {data.demoTraffic.organicSessionsLast30d.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI-Referral Sessions
                </p>
                <p className="text-3xl font-extrabold text-foreground">
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
