import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { knowledgeGraphNodes, knowledgeGraphEdges } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type ExtractedEntity = {
  name: string;
  type: "product" | "service" | "competitor" | "person" | "brand" | "technology" | "location" | "industry";
  properties?: Record<string, unknown>;
};

export type ExtractedRelationship = {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: "belongs_to" | "competes_with" | "uses" | "offers" | "targets" | "located_in";
  properties?: Record<string, unknown>;
};

/**
 * Heuristically extracts domain entities and relationships from brand text.
 */
export function extractGraphElements(text: string): {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  const entities: ExtractedEntity[] = [];
  const relationships: ExtractedRelationship[] = [];
  const lower = text.toLowerCase();

  // Basic entity recognition rules
  if (lower.includes("product") || lower.includes("tool") || lower.includes("feature")) {
    entities.push({ name: "Core Product", type: "product" });
  }
  if (lower.includes("competitor") || lower.includes("rival")) {
    entities.push({ name: "Primary Competitor", type: "competitor" });
    relationships.push({
      sourceEntityName: "Primary Competitor",
      targetEntityName: "Core Product",
      relationshipType: "competes_with",
    });
  }
  if (lower.includes("technology") || lower.includes("ai") || lower.includes("platform")) {
    entities.push({ name: "AI Technology", type: "technology" });
    relationships.push({
      sourceEntityName: "Core Product",
      targetEntityName: "AI Technology",
      relationshipType: "uses",
    });
  }

  return { entities, relationships };
}

/**
 * Extracts and persists knowledge graph nodes and edges for a brand document.
 */
export async function processAndPersistGraph(
  brandId: string,
  documentText: string,
  actorUserId?: string,
): Promise<ActionResult<{ nodeCount: number; edgeCount: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor", actorUserId);
    const db = getDb();

    const { entities, relationships } = extractGraphElements(documentText);
    const nodeMap = new Map<string, string>();
    let nodeCount = 0;

    for (const ent of entities) {
      const [existing] = await db
        .select({ id: knowledgeGraphNodes.id })
        .from(knowledgeGraphNodes)
        .where(and(eq(knowledgeGraphNodes.brandId, brandId), eq(knowledgeGraphNodes.entityName, ent.name)))
        .limit(1);

      if (existing) {
        nodeMap.set(ent.name, existing.id);
      } else {
        const [node] = await db
          .insert(knowledgeGraphNodes)
          .values({
            brandId,
            entityName: ent.name,
            entityType: ent.type,
            properties: ent.properties || {},
          })
          .returning({ id: knowledgeGraphNodes.id });
        nodeMap.set(ent.name, node.id);
        nodeCount++;
      }
    }

    let edgeCount = 0;
    for (const rel of relationships) {
      const sourceId = nodeMap.get(rel.sourceEntityName);
      const targetId = nodeMap.get(rel.targetEntityName);
      if (sourceId && targetId) {
        await db.insert(knowledgeGraphEdges).values({
          brandId,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          relationshipType: rel.relationshipType,
          properties: rel.properties || {},
        });
        edgeCount++;
      }
    }

    return { ok: true, data: { nodeCount, edgeCount } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to process graph elements." };
  }
}

/**
 * Retrieves hybrid Knowledge Graph context for a brand to combine with vector search during generation.
 */
export async function getBrandGraphContext(brandId: string): Promise<string> {
  const db = getDb();
  try {
    const nodes = await db
      .select({ name: knowledgeGraphNodes.entityName, type: knowledgeGraphNodes.entityType })
      .from(knowledgeGraphNodes)
      .where(eq(knowledgeGraphNodes.brandId, brandId))
      .limit(10);

    if (nodes.length === 0) return "";

    const edges = await db
      .select({
        source: knowledgeGraphNodes.entityName,
        rel: knowledgeGraphEdges.relationshipType,
      })
      .from(knowledgeGraphEdges)
      .innerJoin(knowledgeGraphNodes, eq(knowledgeGraphEdges.sourceNodeId, knowledgeGraphNodes.id))
      .where(eq(knowledgeGraphEdges.brandId, brandId))
      .limit(10);

    const nodeList = nodes.map((n) => `${n.name} (${n.type})`).join(", ");
    const relList = edges.map((e) => `${e.source} [${e.rel}]`).join("; ");

    return `\n[KNOWLEDGE GRAPH CONTEXT]\nEntities: ${nodeList}\nRelationships: ${relList || "None registered"}\n`;
  } catch {
    return "";
  }
}
