import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your brand&apos;s growth overview.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Northlight</CardTitle>
          <CardDescription>
            Analytics, keyword scores, competitor gaps, and AI visibility will
            appear here as you build out your brand (Phases 5-11).
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
