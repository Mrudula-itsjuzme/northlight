"use client";

import { useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart,
} from "recharts";
import { BarChart3, CircleHelp, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type StatusItem = { name: string; count: number };
type ActivityItem = { day: string; runs: number; articles: number };
type SeriesData = { statuses: StatusItem[]; activity: ActivityItem[]; stages: StatusItem[] };
const PALETTE: Record<string, string> = {
  Draft: "#94a3b8", Review: "#f59e0b", Approved: "#8b5cf6", Published: "#10b981",
  Pending: "#94a3b8", Running: "#38bdf8", Completed: "#10b981", Failed: "#f43f5e",
};
const DEMO: SeriesData = {
  statuses: [
    { name: "Draft", count: 8 }, { name: "Review", count: 5 },
    { name: "Approved", count: 4 }, { name: "Published", count: 11 },
  ],
  activity: [
    { day: "Mon", runs: 4, articles: 2 }, { day: "Tue", runs: 7, articles: 4 },
    { day: "Wed", runs: 5, articles: 3 }, { day: "Thu", runs: 9, articles: 6 },
    { day: "Fri", runs: 6, articles: 4 }, { day: "Sat", runs: 11, articles: 7 },
    { day: "Sun", runs: 8, articles: 5 },
  ],
  stages: [
    { name: "Completed", count: 32 }, { name: "Running", count: 8 },
    { name: "Pending", count: 6 }, { name: "Failed", count: 4 },
  ],
};
const tooltipStyle = {
  backgroundColor: "rgba(24, 25, 40, .96)",
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 12, color: "#f8fafc", fontSize: 12,
};
const COLORS = ["#94a3b8", "#f59e0b", "#8b5cf6", "#10b981"];

function EmptyChart({ type }: { type: "activity" | "status" }) {
  return (
    <div className="flex h-[250px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/10 text-center">
      <BarChart3 className="h-9 w-9 text-primary/40" />
      <div className="space-y-1 px-4">
        <p className="text-sm font-medium">No {type === "activity" ? "activity" : "articles"} to chart yet</p>
        <p className="max-w-xs text-xs leading-5 text-muted-foreground">
          {type === "activity" ? "Run a content pipeline to start your activity timeline." : "Generated articles will appear in the status breakdown."}
        </p>
      </div>
    </div>
  );
}

export function OperationsVisuals({ live }: { live: SeriesData }) {
  const hasLive = live.activity.some(x => x.runs > 0 || x.articles > 0)
    || live.statuses.some(x => x.count > 0);
  const [view, setView] = useState<"live" | "sample">(hasLive ? "live" : "sample");
  const data = view === "sample" ? DEMO : live;
  const count = data.statuses.reduce((sum, x) => sum + x.count, 0);
  const liveCount = live.statuses.reduce((sum, x) => sum + x.count, 0);
  const chartColor = (name: string) => PALETTE[name] || "#8b5cf6";

  return (
    <section className="space-y-4" aria-label="Operations analytics visualizations">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary"/> Performance at a glance
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {view === "sample" ? "Illustrative sample data. Not your brand's results." : "Real records for the currently selected brand."}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border/80 bg-card/80 p-1" role="group" aria-label="Chart data mode">
          <button type="button" onClick={() => setView("live")}
            aria-pressed={view === "live"}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Live brand data
          </button>
          <button type="button" onClick={() => setView("sample")}
            aria-pressed={view === "sample"}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === "sample" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Sample preview
          </button>
        </div>
      </div>
      {view === "sample" && (
        <div className="flex items-start gap-2 rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 text-xs text-foreground">
          <CircleHelp className="h-4 w-4 shrink-0 text-violet-500"/>
          <span><strong>SAMPLE DATA ONLY.</strong> These numbers are fictional and don't belong to {hasLive ? "the selected brand" : "your brand"}.
            {liveCount === 0 ? " Select Live brand data to see the empty real-data state." : " Switch to Live brand data for actual values."}</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Content & pipeline activity</CardTitle>
            <CardDescription>{view === "sample" ? "Example seven-day pattern" : "Latest seven days · UTC"}</CardDescription>
          </CardHeader>
          <CardContent>
            {!data.activity.some(x => x.runs || x.articles) ? <EmptyChart type="activity"/> : (
              <div role="img" aria-label="Area chart showing article creations and pipeline runs over seven days" className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.activity} margin={{ top: 10, right: 8, left: -24, bottom: 2 }}>
                    <defs>
                      <linearGradient id="opsRunsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,.16)" strokeDasharray="4 4"/>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Area type="monotone" dataKey="runs" name="Pipeline runs" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#opsRunsFill)" dot={{ r: 2 }}/>
                    <Area type="monotone" dataKey="articles" name="Articles" stroke="#06b6d4" strokeWidth={2.5} fill="transparent" dot={{ r: 2 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Article status mix</CardTitle>
            <CardDescription>{view === "sample" ? "Illustrative distribution" : "Most recent 30 articles"}</CardDescription>
          </CardHeader>
          <CardContent>
            {count === 0 ? <EmptyChart type="status"/> : (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(105px,0.7fr)] items-center gap-2">
                <div className="relative h-[230px] min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.statuses} dataKey="count" nameKey="name" innerRadius="63%" outerRadius="88%" strokeWidth={3} stroke="transparent">
                        {data.statuses.map((entry) => <Cell key={entry.name} fill={chartColor(entry.name)}/>)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black tabular-nums">{count}</span>
                    <span className="text-[10px] text-muted-foreground">articles</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {data.statuses.map(s => (
                    <div key={s.name} className="flex items-center justify-between gap-1 text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColor(s.name) }}/>{s.name}</span>
                      <span className="font-bold tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card glass>
        <CardHeader>
          <CardTitle className="text-base">Pipeline health</CardTitle>
          <CardDescription>{view === "sample" ? "Illustrative job outcomes" : "Latest 100 content runs"}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.stages.every(s => s.count === 0) ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-5 py-8 text-center text-sm text-muted-foreground">
              No pipeline runs recorded for this brand yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[2fr_1fr] md:items-center">
              <div className="h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={data.stages} margin={{ top: 2, right: 18, left: 0, bottom: 2 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Bar dataKey="count" name="Runs" radius={[0, 7, 7, 0]}>
                      {data.stages.map((s) => <Cell key={s.name} fill={chartColor(s.name)}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-4">
                <p className="text-xs text-muted-foreground">Successful run rate</p>
                <p className="mt-1 text-3xl font-black tabular-nums">
                  {data.stages.reduce((s, x) => s + x.count, 0) === 0 ? "N/A" :
                    `${Math.round(100 * (data.stages.find(s => s.name === "Completed")?.count || 0) / data.stages.reduce((s, x) => s + x.count, 0))}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Completed / all recent runs</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
