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
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex items-start gap-2" noValidate>
        <div className="flex-1">
          <Input placeholder="e.g. best detangling brush for kids" {...register("promptText")} />
          {errors.promptText && (
            <p className="mt-1 text-xs text-destructive">{errors.promptText.message}</p>
          )}
        </div>
        <Button type="submit">Add prompt</Button>
      </form>

      {prompts.length === 0 && (
        <p className="text-sm text-muted-foreground">No prompts configured yet.</p>
      )}

      <div className="space-y-3">
        {prompts.map((prompt) => {
          const promptSnapshots = snapshots.filter((s) => s.promptId === prompt.id);
          return (
            <div key={prompt.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{prompt.promptText}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pendingId === prompt.id}
                    onClick={() => onRunSnapshot(prompt.id)}
                  >
                    Run snapshot
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pendingId === prompt.id}
                    onClick={() => onDelete(prompt.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {promptSnapshots.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {promptSnapshots.slice(0, 6).map((snap) => (
                    <div key={snap.id} className="rounded border p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{snap.platformDisplayName}</span>
                        {snap.isDemo && <DataBadge kind="demo" className="px-1 py-0.5 text-[10px]" />}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {snap.mentioned ? `Mentioned (#${snap.position ?? "?"})` : "Not mentioned"}
                        {" · "}
                        {snap.sentiment}
                      </p>
                      <p className="text-muted-foreground">
                        confidence {snap.confidence?.toFixed(2) ?? "—"}
                      </p>
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
