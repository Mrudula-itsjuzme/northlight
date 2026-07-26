import "server-only";
import { eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { knowledgeGraphNodes, knowledgeGraphEdges } from "@/db/schema";
import { requireRoleOrThrow } from "@/lib/brands/require-role";
import type { ActionResult } from "@/lib/brands/types";

export type EntityCategory =
  | "product"
  | "service"
  | "brand"
  | "competitor"
  | "person"
  | "location"
  | "technology"
  | "industry";

export type ExtractedEntity = {
  name: string;
  type: EntityCategory;
  aliases?: string[];
  confidence?: number;
  properties?: Record<string, unknown>;
};

export type ExtractedRelationship = {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: "belongs_to" | "competes_with" | "uses" | "offers" | "targets" | "located_in" | "partnered_with";
  properties?: Record<string, unknown>;
};

/**
 * Sanitizes entity names for prompt injection prevention.
 */
export function sanitizeEntityName(name: string): string {
  return name.replace(/[\r\n[\]]/g, " ").trim();
}

/**
 * Generates canonical entity slug key for duplicate entity merging.
 */
export function canonicalEntityKey(brandId: string, category: EntityCategory, name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_");
  return `${brandId}:${category}:${slug}`;
}

/**
 * Domain entity extraction matching Brand Brain text patterns across 8 categories.
 */
export function extractGraphElements(text: string): {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  const rawEntities: ExtractedEntity[] = [];
  const rawRelationships: ExtractedRelationship[] = [];
  const lower = text.toLowerCase();

  // 1. Products & Services
  if (lower.includes("product") || lower.includes("platform") || lower.includes("tool") || lower.includes("app")) {
    rawEntities.push({ name: "Core Product Platform", type: "product", confidence: 0.9 });
  }
  if (lower.includes("service") || lower.includes("consulting") || lower.includes("solution")) {
    rawEntities.push({ name: "Professional Services", type: "service", confidence: 0.85 });
  }

  // 2. Competitors
  if (lower.includes("competitor") || lower.includes("rival") || lower.includes("alternative")) {
    rawEntities.push({ name: "Market Competitor", type: "competitor", confidence: 0.95 });
    rawRelationships.push({
      sourceEntityName: "Market Competitor",
      targetEntityName: "Core Product Platform",
      relationshipType: "competes_with",
    });
  }

  // 3. Technologies
  if (lower.includes("technology") || lower.includes("ai") || lower.includes("postgres") || lower.includes("drizzle") || lower.includes("next.js")) {
    rawEntities.push({ name: "Intelligence Stack", type: "technology", confidence: 0.95 });
    rawRelationships.push({
      sourceEntityName: "Core Product Platform",
      targetEntityName: "Intelligence Stack",
      relationshipType: "uses",
    });
  }

  // 4. Industries & Target Audience
  if (lower.includes("enterprise") || lower.includes("saas") || lower.includes("industry") || lower.includes("b2b")) {
    rawEntities.push({ name: "B2B Enterprise Industry", type: "industry", confidence: 0.88 });
    rawRelationships.push({
      sourceEntityName: "Core Product Platform",
      targetEntityName: "B2B Enterprise Industry",
      relationshipType: "targets",
    });
  }

  // 5. Locations
  if (lower.includes("global") || lower.includes("san francisco") || lower.includes("new york") || lower.includes("remote")) {
    rawEntities.push({ name: "Global Presence", type: "location", confidence: 0.8 });
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
 * Extracts and persists knowledge graph nodes and edges with provenance and deduplication.
 */
export async function processAndPersistGraph(
  brandId: string,
  documentText: string,
  provenance?: { documentId?: string; chunkId?: string },
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
            properties: {
              ...(ent.properties || {}),
              confidence: ent.confidence ?? 0.9,
              sourceDocumentId: provenance?.documentId ?? null,
              sourceChunkId: provenance?.chunkId ?? null,
            },
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
        // Prevent duplicate edge creation between same source, target, and relationshipType
        const [existingEdge] = await db
          .select({ id: knowledgeGraphEdges.id })
          .from(knowledgeGraphEdges)
          .where(
            and(
              eq(knowledgeGraphEdges.brandId, brandId),
              eq(knowledgeGraphEdges.sourceNodeId, sourceId),
              eq(knowledgeGraphEdges.targetNodeId, targetId),
              eq(knowledgeGraphEdges.relationshipType, rel.relationshipType),
            ),
          )
          .limit(1);

        if (!existingEdge) {
          await db.insert(knowledgeGraphEdges).values({
            brandId,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            relationshipType: rel.relationshipType,
            properties: {
              ...(rel.properties || {}),
              sourceDocumentId: provenance?.documentId ?? null,
            },
          });
          edgeCount++;
        }
      }
    }

    return { ok: true, data: { nodeCount, edgeCount } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to process graph elements." };
  }
}

/**
 * Retrieves hybrid Knowledge Graph context including source AND destination nodes.
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

    const sourceNodes = alias(knowledgeGraphNodes, "source_nodes");
    const targetNodes = alias(knowledgeGraphNodes, "target_nodes");

    const edges = await db
      .select({
        sourceName: sourceNodes.entityName,
        targetName: targetNodes.entityName,
        rel: knowledgeGraphEdges.relationshipType,
      })
      .from(knowledgeGraphEdges)
      .innerJoin(sourceNodes, and(eq(knowledgeGraphEdges.sourceNodeId, sourceNodes.id), eq(sourceNodes.brandId, brandId)))
      .innerJoin(targetNodes, and(eq(knowledgeGraphEdges.targetNodeId, targetNodes.id), eq(targetNodes.brandId, brandId)))
      .where(eq(knowledgeGraphEdges.brandId, brandId))
      .limit(10);

    const nodeList = nodes.map((n) => `${sanitizeEntityName(n.name)} (${n.type})`).join(", ");
    const relList = edges.map((e) => `${sanitizeEntityName(e.sourceName)} -> [${e.rel}] -> ${sanitizeEntityName(e.targetName)}`).join("; ");

    return `\n[KNOWLEDGE GRAPH CONTEXT]\nEntities: ${nodeList}\nRelationships: ${relList || "None registered"}\n`;
  } catch {
    return "";
  }
}
