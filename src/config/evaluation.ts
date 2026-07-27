import "server-only";
import { z } from "zod";

export const categoryWeightsSchema = z.object({
  factual_grounding: z.number().min(0).max(1).default(0.1),
  brand_brain_grounding: z.number().min(0).max(1).default(0.1),
  brand_voice: z.number().min(0).max(1).default(0.1),
  readability: z.number().min(0).max(1).default(0.1),
  seo_quality: z.number().min(0).max(1).default(0.1),
  entity_coverage: z.number().min(0).max(1).default(0.1),
  duplicate_detection: z.number().min(0).max(1).default(0.1),
  hallucination_likelihood: z.number().min(0).max(1).default(0.1),
  structure_quality: z.number().min(0).max(1).default(0.1),
  citation_coverage: z.number().min(0).max(1).default(0.1),
});

export type CategoryWeights = z.infer<typeof categoryWeightsSchema>;

export const priorityWeightsSchema = z.object({
  volume: z.number().min(0).max(1).default(0.3),
  difficulty: z.number().min(0).max(1).default(0.25),
  commercialIntent: z.number().min(0).max(1).default(0.2),
  trend: z.number().min(0).max(1).default(0.15),
  businessValue: z.number().min(0).max(1).default(0.1),
});

export type PriorityWeights = z.infer<typeof priorityWeightsSchema>;

export type EvaluationProfile = {
  id: string;
  name: string;
  description: string;
  categoryWeights: CategoryWeights;
  priorityWeights: PriorityWeights;
  evaluatorVersion: string;
};

export const EVALUATION_PROFILES: Record<string, EvaluationProfile> = {
  default: {
    id: "default",
    name: "Standard Balanced Quality Profile",
    description: "Equal weighting across all 10 evaluation categories and standard keyword priority weights.",
    categoryWeights: {
      factual_grounding: 0.1,
      brand_brain_grounding: 0.1,
      brand_voice: 0.1,
      readability: 0.1,
      seo_quality: 0.1,
      entity_coverage: 0.1,
      duplicate_detection: 0.1,
      hallucination_likelihood: 0.1,
      structure_quality: 0.1,
      citation_coverage: 0.1,
    },
    priorityWeights: {
      volume: 0.3,
      difficulty: 0.25,
      commercialIntent: 0.2,
      trend: 0.15,
      businessValue: 0.1,
    },
    evaluatorVersion: "v2.0.0",
  },
  seo_focused: {
    id: "seo_focused",
    name: "SEO Optimization Profile",
    description: "Emphasizes SEO quality, readability, entity coverage, and search volume.",
    categoryWeights: {
      factual_grounding: 0.08,
      brand_brain_grounding: 0.08,
      brand_voice: 0.08,
      readability: 0.15,
      seo_quality: 0.25,
      entity_coverage: 0.15,
      duplicate_detection: 0.07,
      hallucination_likelihood: 0.04,
      structure_quality: 0.05,
      citation_coverage: 0.05,
    },
    priorityWeights: {
      volume: 0.45,
      difficulty: 0.2,
      commercialIntent: 0.15,
      trend: 0.1,
      businessValue: 0.1,
    },
    evaluatorVersion: "v2.0.0-seo",
  },
  brand_strict: {
    id: "brand_strict",
    name: "Strict Brand Integrity & Compliance Profile",
    description: "Prioritizes factual grounding, brand brain overlap, and citation coverage.",
    categoryWeights: {
      factual_grounding: 0.2,
      brand_brain_grounding: 0.2,
      brand_voice: 0.15,
      readability: 0.05,
      seo_quality: 0.05,
      entity_coverage: 0.05,
      duplicate_detection: 0.05,
      hallucination_likelihood: 0.1,
      structure_quality: 0.05,
      citation_coverage: 0.1,
    },
    priorityWeights: {
      volume: 0.15,
      difficulty: 0.15,
      commercialIntent: 0.2,
      trend: 0.1,
      businessValue: 0.4,
    },
    evaluatorVersion: "v2.0.0-strict",
  },
};

const BRAND_PROFILE_OVERRIDES: Record<string, string> = {};

export function getEvaluationProfile(profileIdOrBrandId?: string): EvaluationProfile {
  if (!profileIdOrBrandId) return EVALUATION_PROFILES.default;

  // Check if profile ID directly matches registered profiles
  if (EVALUATION_PROFILES[profileIdOrBrandId]) {
    return EVALUATION_PROFILES[profileIdOrBrandId];
  }

  // Check brand override mapping
  const overrideProfileId = BRAND_PROFILE_OVERRIDES[profileIdOrBrandId];
  if (overrideProfileId && EVALUATION_PROFILES[overrideProfileId]) {
    return EVALUATION_PROFILES[overrideProfileId];
  }

  return EVALUATION_PROFILES.default;
}

export function registerBrandEvaluationProfileOverride(brandId: string, profileId: string): void {
  if (!EVALUATION_PROFILES[profileId]) {
    throw new Error(`Cannot override brand profile with unknown profile ID '${profileId}'.`);
  }
  BRAND_PROFILE_OVERRIDES[brandId] = profileId;
}
