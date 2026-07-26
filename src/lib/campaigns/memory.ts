import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { campaignMemories } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type CampaignMemoryInput = {
  brandId: string;
  title: string;
  campaignGoals?: string;
  toneAndStyle?: string;
  keyMessaging?: string;
  ctas?: string[];
  seasonalContext?: string;
  targetPersonas?: string[];
  publishingCadence?: string;
  startDate?: Date;
  endDate?: Date;
};

export type ActiveCampaignContext = {
  title: string;
  goals: string;
  toneAndStyle: string;
  messaging: string;
  ctas: string[];
  seasonalContext: string;
  targetPersonas: string[];
};

/**
 * Creates or updates a campaign memory context for a brand.
 */
export async function createCampaignMemory(
  input: CampaignMemoryInput,
  actorUserId?: string,
): Promise<ActionResult<{ campaignId: string }>> {
  try {
    await requireRoleOrThrow(input.brandId, "editor");
    const db = getDb();

    const [memory] = await db
      .insert(campaignMemories)
      .values({
        brandId: input.brandId,
        title: input.title,
        campaignGoals: input.campaignGoals ?? null,
        toneAndStyle: input.toneAndStyle ?? null,
        keyMessaging: input.keyMessaging ?? null,
        ctas: input.ctas ?? [],
        seasonalContext: input.seasonalContext ?? null,
        targetPersonas: input.targetPersonas ?? [],
        publishingCadence: input.publishingCadence ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        isActive: true,
      })
      .returning({ id: campaignMemories.id });

    return { ok: true, data: { campaignId: memory.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create campaign memory." };
  }
}

/**
 * Retrieves the currently active campaign context for content generation.
 */
export async function getActiveCampaignContext(
  brandId: string,
): Promise<ActiveCampaignContext | null> {
  const db = getDb();
  try {
    const [active] = await db
      .select()
      .from(campaignMemories)
      .where(and(eq(campaignMemories.brandId, brandId), eq(campaignMemories.isActive, true)))
      .orderBy(desc(campaignMemories.createdAt))
      .limit(1);

    if (!active) return null;

    return {
      title: active.title,
      goals: active.campaignGoals || "Maintain brand authority and search dominance.",
      toneAndStyle: active.toneAndStyle || "Authoritative, engaging, data-informed.",
      messaging: active.keyMessaging || "Highlight product value, quality, and industry best practices.",
      ctas: active.ctas || [],
      seasonalContext: active.seasonalContext || "Evergreen focus with seasonal relevance.",
      targetPersonas: active.targetPersonas || ["General Audience"],
    };
  } catch {
    return null;
  }
}

/**
 * Formats Campaign Memory context into a prompt injection string for Research & Strategy pipeline stages.
 */
export function formatCampaignMemoryPrompt(context: ActiveCampaignContext | null): string {
  if (!context) return "";

  return `
[CAMPAIGN MEMORY CONTEXT]
Campaign Title: ${context.title}
Campaign Goals: ${context.goals}
Tone & Style: ${context.toneAndStyle}
Key Messaging: ${context.messaging}
Target Personas: ${context.targetPersonas.join(", ")}
CTAs: ${context.ctas.join(" | ")}
Seasonal Context: ${context.seasonalContext}
`;
}
