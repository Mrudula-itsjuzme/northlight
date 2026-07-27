import "server-only";
import { z } from "zod";

export const entityCategorySchema = z.enum([
  "product",
  "service",
  "brand",
  "competitor",
  "person",
  "location",
  "technology",
  "industry",
]);

export type EntityCategory = z.infer<typeof entityCategorySchema>;

export const relationshipTypeSchema = z.enum([
  "belongs_to",
  "competes_with",
  "uses",
  "offers",
  "targets",
  "located_in",
  "partnered_with",
]);

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export type CategoryExtractionRule = {
  category: EntityCategory;
  triggerKeywords: string[];
  defaultName: string;
  defaultConfidence: number;
  autoRelationship?: {
    sourceEntityName?: string;
    targetEntityName?: string;
    relationshipType: RelationshipType;
  };
};

export type KnowledgeGraphProfile = {
  id: string;
  name: string;
  categories: EntityCategory[];
  relationshipTypes: RelationshipType[];
  extractionRules: CategoryExtractionRule[];
  maxContextEntities: number;
  maxContextEdges: number;
};

export const DEFAULT_KG_PROFILE: KnowledgeGraphProfile = {
  id: "default",
  name: "Standard Northlight Knowledge Graph Extraction Profile",
  categories: [
    "product",
    "service",
    "brand",
    "competitor",
    "person",
    "location",
    "technology",
    "industry",
  ],
  relationshipTypes: [
    "belongs_to",
    "competes_with",
    "uses",
    "offers",
    "targets",
    "located_in",
    "partnered_with",
  ],
  maxContextEntities: 10,
  maxContextEdges: 10,
  extractionRules: [
    {
      category: "product",
      triggerKeywords: ["product", "platform", "tool", "app"],
      defaultName: "Core Product Platform",
      defaultConfidence: 0.9,
    },
    {
      category: "service",
      triggerKeywords: ["service", "consulting", "solution"],
      defaultName: "Professional Services",
      defaultConfidence: 0.85,
    },
    {
      category: "competitor",
      triggerKeywords: ["competitor", "rival", "alternative"],
      defaultName: "Market Competitor",
      defaultConfidence: 0.95,
      autoRelationship: {
        targetEntityName: "Core Product Platform",
        relationshipType: "competes_with",
      },
    },
    {
      category: "technology",
      triggerKeywords: ["technology", "ai", "postgres", "drizzle", "next.js"],
      defaultName: "Intelligence Stack",
      defaultConfidence: 0.95,
      autoRelationship: {
        sourceEntityName: "Core Product Platform",
        relationshipType: "uses",
      },
    },
    {
      category: "industry",
      triggerKeywords: ["enterprise", "saas", "industry", "b2b"],
      defaultName: "B2B Enterprise Industry",
      defaultConfidence: 0.88,
      autoRelationship: {
        sourceEntityName: "Core Product Platform",
        relationshipType: "targets",
      },
    },
    {
      category: "location",
      triggerKeywords: ["global", "san francisco", "new york", "remote"],
      defaultName: "Global Presence",
      defaultConfidence: 0.8,
    },
  ],
};

export function getKnowledgeGraphProfile(): KnowledgeGraphProfile {
  return DEFAULT_KG_PROFILE;
}
