import { getActiveBrandId } from "@/lib/brands/actions";
import { listAiPrompts, listVisibilitySnapshots } from "@/lib/ai/visibility/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PromptList } from "./prompt-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Eye, AlertCircle, Sparkles, Bot } from "lucide-react";
import { VISIBILITY_PLATFORMS } from "@/config/visibility";

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: "from-emerald-500 to-teal-600",
  claude: "from-purple-500 to-indigo-600",
  gemini: "from-cyan-500 to-blue-600",
  perplexity: "from-amber-500 to-orange-600",
  copilot: "from-pink-500 to-rose-600",
  ai_overviews: "from-red-500 to-amber-600",
};

const PLATFORMS = Object.values(VISIBILITY_PLATFORMS).map((p) => ({
  name: p.displayName,
  color: PLATFORM_COLORS[p.key] ?? "from-violet-500 to-cyan-600",
  status: p.hasLiveProvider ? "Live/Demo Adapter" : "Demo Adapter",
}));

export default async function VisibilityPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the left navigation sidebar to select or create a brand."
      />
    );
  }

  const [promptsResult, snapshotsResult] = await Promise.all([
    listAiPrompts(brandId),
    listVisibilitySnapshots(brandId),
  ]);

  const prompts = promptsResult.ok ? promptsResult.data : [];
  const snapshots = snapshotsResult.ok ? snapshotsResult.data : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-gradient-purple">AI Visibility Radar</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
              <Eye className="h-3.5 w-3.5" /> {PLATFORMS.length} Engines Tracked
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Real-time mention tracking, sentiment evaluation, and brand presence analysis across AI search engines.
          </p>
        </div>
      </div>

      {/* Engine Platform Coverage Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {PLATFORMS.map((platform) => (
          <Card key={platform.name} glass className="p-4 space-y-2 hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr ${platform.color} text-white shadow-sm`}>
                <Bot className="h-4 w-4" />
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">{platform.name}</h3>
              <p className="text-[10px] text-muted-foreground font-mono">{platform.status}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Methodology Alert Banner */}
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 backdrop-blur-sm space-y-1">
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Directional Visibility Methodology Note</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed pl-6">
          Results reflect directional mentions, sentiment, and presence confidence extracted from real or simulated AI assistant responses. Numbers are directional proxies for strategy, not official ledger citation totals.
        </p>
      </div>

      {/* Prompts Monitoring List */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" /> Monitored AI Prompts & Snapshots
          </CardTitle>
          <CardDescription>
            Configure high-intent search queries that potential customers ask AI assistants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PromptList brandId={brandId} prompts={prompts} snapshots={snapshots} />
        </CardContent>
      </Card>
    </div>
  );
}
