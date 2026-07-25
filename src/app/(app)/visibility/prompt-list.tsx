"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { aiPromptSchema, type AiPromptInput } from "@/lib/validation/ai-prompts";
import {
  createAiPrompt,
  deleteAiPrompt,
  runVisibilitySnapshot,
  type AiPromptItem,
  type VisibilitySnapshotItem,
} from "@/lib/ai/visibility/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataBadge } from "@/components/ui/data-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eye, Plus, Sparkles, Trash2, CheckCircle2, XCircle, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function PromptList({
  brandId,
  prompts,
  snapshots,
}: {
  brandId: string;
  prompts: AiPromptItem[];
  snapshots: VisibilitySnapshotItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AiPromptInput>({ resolver: zodResolver(aiPromptSchema) });

  async function onSubmit(values: AiPromptInput) {
    const result = await createAiPrompt(brandId, values);
    if (result.ok) {
      reset();
      router.refresh();
    }
  }

  async function onDelete(promptId: string) {
    setPendingId(promptId);
    try {
      await deleteAiPrompt(brandId, promptId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function onRunSnapshot(promptId: string) {
    setPendingId(promptId);
    try {
      await runVisibilitySnapshot(brandId, promptId);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Prompt Input */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row items-start gap-3" noValidate>
        <div className="flex-1 w-full">
          <div className="relative">
            <Bot className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="e.g. best organic sunscreen for sensitive skin"
              className="pl-9 bg-card/60"
              {...register("promptText")}
            />
          </div>
          {errors.promptText && (
            <p className="mt-1 text-xs text-rose-400 font-medium">{errors.promptText.message}</p>
          )}
        </div>
        <Button type="submit" variant="gradient" className="w-full sm:w-auto shrink-0 gap-1.5 shadow-glow">
          <Plus className="h-4 w-4" /> Add Prompt Query
        </Button>
      </form>

      {prompts.length === 0 && (
        <EmptyState
          icon={Eye}
          title="No search prompts configured yet"
          description="Add a prompt query above (e.g. a question customers ask AI search assistants), then run a snapshot to evaluate visibility across all engines."
        />
      )}

      {/* Prompts Cards */}
      <div className="space-y-4">
        {prompts.map((prompt) => {
          const promptSnapshots = snapshots.filter((s) => s.promptId === prompt.id);
          return (
            <div
              key={prompt.id}
              className="rounded-2xl border border-border/80 bg-card/40 p-5 space-y-4 backdrop-blur-md transition-all hover:border-primary/30"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="font-semibold text-base text-foreground flex items-center gap-2">
                  <Eye className="h-4 w-4 text-cyan-400" />
                  &ldquo;{prompt.promptText}&rdquo;
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="gradient"
                    className="h-8 text-xs gap-1.5"
                    disabled={pendingId === prompt.id}
                    onClick={() => onRunSnapshot(prompt.id)}
                  >
                    {pendingId === prompt.id ? (
                      <>
                        <Sparkles className="h-3.5 w-3.5 animate-spin" /> Scanning...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" /> Run Radar Scan
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs px-2"
                    disabled={pendingId === prompt.id}
                    onClick={() => onDelete(prompt.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Snapshot Engine Results Grid */}
              {promptSnapshots.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {promptSnapshots.slice(0, 6).map((snap) => (
                    <div
                      key={snap.id}
                      className={cn(
                        "rounded-xl border p-3 text-xs space-y-1.5 backdrop-blur-sm transition-all",
                        snap.mentioned
                          ? "border-emerald-500/30 bg-emerald-500/5 shadow-glow-sm"
                          : "border-border/60 bg-card/60",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-primary" /> {snap.platformDisplayName}
                        </span>
                        {snap.isDemo && <DataBadge kind="demo" className="px-1.5 py-0.5 text-[10px]" />}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="flex items-center gap-1 font-semibold">
                          {snap.mentioned ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mentioned (#{snap.position ?? "1"})
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground/60" /> Not Mentioned
                            </span>
                          )}
                        </span>
                        <span className="capitalize font-mono text-[10px] text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded">
                          {snap.sentiment}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/40">
                        <span>Confidence</span>
                        <span>{snap.confidence ? `${(snap.confidence * 100).toFixed(0)}%` : "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
