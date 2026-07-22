import { getActiveBrandId } from "@/lib/brands/actions";
import { listAiPrompts, listVisibilitySnapshots } from "@/lib/ai/visibility/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PromptList } from "./prompt-list";
import { EmptyState } from "@/components/ui/empty-state";

export default async function VisibilityPage() {
  const brandId = await getActiveBrandId();
  if (!brandId) {
    return (
      <EmptyState
        title="Select a brand to continue"
        description="Use the brand switcher in the top bar to choose or create a brand."
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Visibility</h1>
        <p className="text-muted-foreground">
          Tracks whether, where, and how your brand is mentioned across 6
          AI platforms (ChatGPT, Claude, Gemini, Perplexity, Copilot, AI
          Overviews) for prompts you configure.
        </p>
        <p className="mt-2 rounded-md bg-demo/10 px-3 py-2 text-sm text-demo">
          Methodology: results are DIRECTIONAL ONLY. Mention/position/
          sentiment/confidence reflect this app&apos;s own extraction from a
          platform response at a point in time — never an official or
          authoritative citation count, and never a guarantee of future
          behavior. All platforms except ChatGPT (and ChatGPT itself
          without a configured OpenAI key) use a deterministic demo
          adapter, clearly labeled below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prompts</CardTitle>
          <CardDescription>
            Prompts you&apos;d expect a customer to ask an AI assistant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PromptList brandId={brandId} prompts={prompts} snapshots={snapshots} />
        </CardContent>
      </Card>
    </div>
  );
}
