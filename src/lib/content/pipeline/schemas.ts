import { z } from "zod";

/**
 * Typed Zod contracts for every content pipeline stage's input/output.
 * Each stage is a pure function `(input) => output` (see stages.ts) run
 * by the pipeline runner (runner.ts), with input/output persisted as JSON
 * on a `content_pipeline_steps` row. Keeping every stage's contract
 * explicit here — rather than passing loosely-typed objects between
 * stages — is what makes a step "retryable": re-running stage N only
 * needs stage N's already-persisted input, not the whole run's history.
 */

export const pipelineStages = [
  "research",
  "strategy",
  "outline",
  "writer",
  "editor",
  "seo_optimizer",
  "fact_check",
  "schema_generator",
] as const;
export type PipelineStage = (typeof pipelineStages)[number];

// ---------------------------------------------------------------------------
// Shared brief context every stage receives as part of its input.
// ---------------------------------------------------------------------------
export const briefContextSchema = z.object({
  primaryKeyword: z.string().min(1),
  supportingKeywords: z.array(z.string()).default([]),
  targetAudience: z.string().optional(),
  searchIntent: z.string().optional(),
  brandName: z.string().min(1),
});
export type BriefContext = z.infer<typeof briefContextSchema>;

// ---------------------------------------------------------------------------
// Stage 1: Research
// ---------------------------------------------------------------------------
export const researchInputSchema = z.object({ brief: briefContextSchema });
export type ResearchInput = z.infer<typeof researchInputSchema>;

export const researchOutputSchema = z.object({
  keyFacts: z.array(z.string()).min(1),
  competitorAngles: z.array(z.string()).default([]),
  brandContextSnippets: z.array(z.string()).default([]),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 2: Strategy
// ---------------------------------------------------------------------------
export const strategyInputSchema = z.object({
  brief: briefContextSchema,
  research: researchOutputSchema,
});
export type StrategyInput = z.infer<typeof strategyInputSchema>;

export const strategyOutputSchema = z.object({
  angle: z.string().min(1),
  contentType: z.enum(["guide", "comparison", "listicle", "how_to", "product_roundup"]),
  differentiators: z.array(z.string()).default([]),
});
export type StrategyOutput = z.infer<typeof strategyOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 3: Outline
// ---------------------------------------------------------------------------
export const outlineInputSchema = z.object({
  brief: briefContextSchema,
  strategy: strategyOutputSchema,
});
export type OutlineInput = z.infer<typeof outlineInputSchema>;

export const outlineHeadingSchema = z.object({
  level: z.union([z.literal(2), z.literal(3)]),
  heading: z.string().min(1),
  notes: z.string().optional(),
});
export const outlineOutputSchema = z.object({
  title: z.string().min(1),
  headings: z.array(outlineHeadingSchema).min(1),
});
export type OutlineOutput = z.infer<typeof outlineOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 4: Writer
// ---------------------------------------------------------------------------
export const writerInputSchema = z.object({
  brief: briefContextSchema,
  outline: outlineOutputSchema,
});
export type WriterInput = z.infer<typeof writerInputSchema>;

export const writerOutputSchema = z.object({
  bodyHtml: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
});
export type WriterOutput = z.infer<typeof writerOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 5: Editor
// ---------------------------------------------------------------------------
export const editorInputSchema = z.object({ draft: writerOutputSchema });
export type EditorInput = z.infer<typeof editorInputSchema>;

export const editorOutputSchema = z.object({
  bodyHtml: z.string().min(1),
  changesSummary: z.array(z.string()).default([]),
});
export type EditorOutput = z.infer<typeof editorOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 6: SEO Optimizer
// ---------------------------------------------------------------------------
export const seoOptimizerInputSchema = z.object({
  brief: briefContextSchema,
  edited: editorOutputSchema,
});
export type SeoOptimizerInput = z.infer<typeof seoOptimizerInputSchema>;

export const seoOptimizerOutputSchema = z.object({
  bodyHtml: z.string().min(1),
  metaTitle: z.string().min(1).max(70),
  metaDescription: z.string().min(1).max(160),
  slug: z.string().min(1),
});
export type SeoOptimizerOutput = z.infer<typeof seoOptimizerOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 7: Fact Check
// ---------------------------------------------------------------------------
export const factCheckInputSchema = z.object({
  optimized: seoOptimizerOutputSchema,
  research: researchOutputSchema,
});
export type FactCheckInput = z.infer<typeof factCheckInputSchema>;

export const claimSchema = z.object({
  claimText: z.string().min(1),
  supported: z.boolean(),
});
export const factCheckOutputSchema = z.object({
  claims: z.array(claimSchema).default([]),
  unsupportedCount: z.number().int().nonnegative(),
});
export type FactCheckOutput = z.infer<typeof factCheckOutputSchema>;

// ---------------------------------------------------------------------------
// Stage 8: Schema Generator
// ---------------------------------------------------------------------------
export const schemaGeneratorInputSchema = z.object({
  brief: briefContextSchema,
  optimized: seoOptimizerOutputSchema,
});
export type SchemaGeneratorInput = z.infer<typeof schemaGeneratorInputSchema>;

export const schemaGeneratorOutputSchema = z.object({
  jsonLd: z.record(z.string(), z.unknown()),
});
export type SchemaGeneratorOutput = z.infer<typeof schemaGeneratorOutputSchema>;

/** Maps each stage name to its input/output Zod schemas, for the runner's generic dispatch. */
export const STAGE_SCHEMAS = {
  research: { input: researchInputSchema, output: researchOutputSchema },
  strategy: { input: strategyInputSchema, output: strategyOutputSchema },
  outline: { input: outlineInputSchema, output: outlineOutputSchema },
  writer: { input: writerInputSchema, output: writerOutputSchema },
  editor: { input: editorInputSchema, output: editorOutputSchema },
  seo_optimizer: { input: seoOptimizerInputSchema, output: seoOptimizerOutputSchema },
  fact_check: { input: factCheckInputSchema, output: factCheckOutputSchema },
  schema_generator: { input: schemaGeneratorInputSchema, output: schemaGeneratorOutputSchema },
} as const;
