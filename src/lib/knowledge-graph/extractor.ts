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
 * Sanitizes entity names for prompt injection prevention.
 */
function sanitizeEntityName(name: string): string {
  return name.replace(/[\r\n[\]]/g, " ").trim();
}

/**
 * Heuristically extracts domain entities and relationships from brand text.
 */
export function extractGraphElements(text: string): {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  const rawEntities: ExtractedEntity[] = [];
  const rawRelationships: ExtractedRelationship[] = [];
  const lower = text.toLowerCase();

  if (lower.includes("product") || lower.includes("tool") || lower.includes("feature")) {
    rawEntities.push({ name: "Core Product", type: "product" });
  }
  if (lower.includes("competitor") || lower.includes("rival")) {
    rawEntities.push({ name: "Primary Competitor", type: "competitor" });
    rawRelationships.push({
      sourceEntityName: "Primary Competitor",
      targetEntityName: "Core Product",
      relationshipType: "competes_with",
    });
  }
  if (lower.includes("technology") || lower.includes("ai") || lower.includes("platform")) {
    rawEntities.push({ name: "AI Technology", type: "technology" });
    rawRelationships.push({
      sourceEntityName: "Core Product",
      targetEntityName: "AI Technology",
      relationshipType: "uses",
    });
  }

  // Filter out self-referential edges and normalize names
  const entities = rawEntities.map((e) => ({ ...e, name: sanitizeEntityName(e.name) }));
  const relationships = rawRelationships
    .map((r) => ({
      ...r,
      sourceEntityName: sanitizeEntityName(r.sourceEntityName),
      targetEntityName: sanitizeEntityName(r.targetEntityName),
    }))
    .filter((r) => r.sourceEntityName !== r.targetEntityName);

  return { entities, relationships };
}

/**
 * Extracts and persists knowledge graph nodes and edges for a brand document.
 */
export async function processAndPersistGraph(
  brandId: string,
  documentText: string,
): Promise<ActionResult<{ nodeCount: number; edgeCount: number }>> {
  try {
    await requireRoleOrThrow(brandId, "editor");
    const db = getDb();

    const { entities, relationships } = extractGraphElements(documentText);
    const nodeMap = new Map<string, string>();
    let nodeCount = 0;

    for (const ent of entities) {
      const normalizedName = sanitizeEntityName(ent.name);
      const [existing] = await db
        .select({ id: knowledgeGraphNodes.id })
        .from(knowledgeGraphNodes)
        .where(and(eq(knowledgeGraphNodes.brandId, brandId), eq(knowledgeGraphNodes.entityName, normalizedName)))
        .limit(1);

      if (existing) {
        nodeMap.set(normalizedName, existing.id);
      } else {
        const [node] = await db
          .insert(knowledgeGraphNodes)
          .values({
            brandId,
            entityName: normalizedName,
            entityType: ent.type,
            properties: ent.properties || {},
          })
          .returning({ id: knowledgeGraphNodes.id });
        nodeMap.set(normalizedName, node.id);
        nodeCount++;
      }
    }

    let edgeCount = 0;
    for (const rel of relationships) {
      const sourceId = nodeMap.get(rel.sourceEntityName);
      const targetId = nodeMap.get(rel.targetEntityName);
      if (sourceId && targetId && sourceId !== targetId) {
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
 * Enforces strict multi-tenant isolation on joined nodes.
 */
export async function getBrandGraphContext(brandId: string): Promise<string> {
  try {
    const db = getDb();
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
      .innerJoin(
        knowledgeGraphNodes,
        and(eq(knowledgeGraphEdges.sourceNodeId, knowledgeGraphNodes.id), eq(knowledgeGraphNodes.brandId, brandId)),
      )
      .where(eq(knowledgeGraphEdges.brandId, brandId))
      .limit(10);

    const nodeList = nodes.map((n) => `${sanitizeEntityName(n.name)} (${n.type})`).join(", ");
    const relList = edges.map((e) => `${sanitizeEntityName(e.source)} [${e.rel}]`).join("; ");

    return `\n[KNOWLEDGE GRAPH CONTEXT]\nEntities: ${nodeList}\nRelationships: ${relList || "None registered"}\n`;
  } catch {
    return "";
  }
}
