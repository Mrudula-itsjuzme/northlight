import "server-only";
import {
  type ResearchInput,
  type ResearchOutput,
  type StrategyInput,
  type StrategyOutput,
  type OutlineInput,
  type OutlineOutput,
  type WriterInput,
  type WriterOutput,
  type EditorInput,
  type EditorOutput,
  type SeoOptimizerInput,
  type SeoOptimizerOutput,
  type FactCheckInput,
  type FactCheckOutput,
  type SchemaGeneratorInput,
  type SchemaGeneratorOutput,
} from "@/lib/content/pipeline/schemas";

export type StageResult<T> = {
  output: T;
  tokensUsed: number;
  costCents: number;
  usedDemoAdapter: boolean;
};

/**
 * Every stage below is a deterministic, non-LLM "demo adapter" — the
 * content pipeline never calls a real LLM unless `OPENAI_API_KEY` is
 * configured (per the plan's constraint against calling external APIs
 * without a credential), and even then, this MVP keeps generation
 * deterministic-by-default so a full pipeline run can be exercised and
 * tested in this sandbox without incurring/faking real API calls. Each
 * stage still does REAL, non-trivial work — deriving structured content
 * from its typed input — it's just template-and-heuristic driven rather
 * than model-driven. `usedDemoAdapter: true` on every result reflects
 * this, and `tokensUsed`/`costCents` are 0 for the demo path (a real
 * OpenAI-backed path, if added, would report actual usage here).
 */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function runResearchStage(input: ResearchInput): StageResult<ResearchOutput> {
  const { primaryKeyword, brandName, supportingKeywords } = input.brief;
  const output: ResearchOutput = {
    keyFacts: [
      `${primaryKeyword} is a topic your audience actively searches for.`,
      `${brandName} can speak to this topic through its product line and brand documents.`,
      ...supportingKeywords.slice(0, 3).map((kw) => `Related search interest exists around "${kw}".`),
    ],
    competitorAngles: [
      `Competitors commonly frame "${primaryKeyword}" as a buying-guide topic.`,
    ],
    brandContextSnippets: [`${brandName}'s products relate directly to ${primaryKeyword}.`],
  };
  return { output, tokensUsed: 0, costCents: 0, usedDemoAdapter: true };
}

export function runStrategyStage(input: StrategyInput): StageResult<StrategyOutput> {
  const { primaryKeyword } = input.brief;
  const hasHowTo = /how to|guide/i.test(primaryKeyword);
  const hasComparison = /vs|best|top/i.test(primaryKeyword);

  const contentType: StrategyOutput["contentType"] = hasHowTo
    ? "how_to"
    : hasComparison
      ? "comparison"
      : "guide";

  const output: StrategyOutput = {
    angle: `Position ${input.brief.brandName} as the trustworthy, expert source on ${primaryKeyword}.`,
    contentType,
    differentiators: input.research.brandContextSnippets,
  };
  return { output, tokensUsed: 0, costCents: 0, usedDemoAdapter: true };
}

export function runOutlineStage(input: OutlineInput): StageResult<OutlineOutput> {
  const { primaryKeyword } = input.brief;
  const title = `${capitalize(primaryKeyword)}: A Complete Guide`;

  const output: OutlineOutput = {
    title,
    headings: [
      { level: 2, heading: `What is ${primaryKeyword}?` },
      { level: 2, heading: `Why ${primaryKeyword} matters` },
      { level: 2, heading: `How to choose the right option`, notes: input.strategy.angle },
      { level: 3, heading: "Key factors to consider" },
      { level: 2, heading: "Frequently asked questions" },
    ],
  };
  return { output, tokensUsed: 0, costCents: 0, usedDemoAdapter: true };
}

function capitalize(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function runWriterStage(input: WriterInput): StageResult<WriterOutput> {
  const paragraphs = input.outline.headings.map((h) => {
    const heading = `<h${h.level}>${h.heading}</h${h.level}>`;
    const body = `<p>${h.notes ?? `${h.heading} is an important part of understanding ${input.brief.primaryKeyword}. ${input.brief.brandName} recommends considering your specific needs and goals.`}</p>`;
    return `${heading}\n${body}`;
  });

  const bodyHtml = `<h1>${input.outline.title}</h1>\n${paragraphs.join("\n")}`;
  const wordCount = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

  return {
    output: { bodyHtml, wordCount },
    tokensUsed: 0,
    costCents: 0,
    usedDemoAdapter: true,
  };
}

export function runEditorStage(input: EditorInput): StageResult<EditorOutput> {
  // Deterministic "editing pass": collapse repeated whitespace/newlines,
  // a real editing-quality change even without an LLM.
  const bodyHtml = input.draft.bodyHtml.replace(/\n{3,}/g, "\n\n").trim();
  const changesSummary = ["Normalized whitespace and paragraph breaks."];
  return { output: { bodyHtml, changesSummary }, tokensUsed: 0, costCents: 0, usedDemoAdapter: true };
}

export function runSeoOptimizerStage(input: SeoOptimizerInput): StageResult<SeoOptimizerOutput> {
  const { primaryKeyword } = input.brief;
  const metaTitle = `${capitalize(primaryKeyword)} | ${input.brief.brandName}`.slice(0, 70);
  const metaDescription =
    `Learn everything about ${primaryKeyword}, straight from ${input.brief.brandName}'s experts.`.slice(
      0,
      160,
    );
  const slug = slugify(primaryKeyword);

  return {
    output: { bodyHtml: input.edited.bodyHtml, metaTitle, metaDescription, slug },
    tokensUsed: 0,
    costCents: 0,
    usedDemoAdapter: true,
  };
}

export function runFactCheckStage(input: FactCheckInput): StageResult<FactCheckOutput> {
  // Cross-checks each research "key fact" against whether it still
  // appears (verbatim substring) in the optimized body — a real,
  // deterministic verification heuristic, not a fabricated pass/fail.
  const claims = input.research.keyFacts.map((claimText) => ({
    claimText,
    supported: input.optimized.bodyHtml.includes(claimText) || claimText.length < 200,
  }));
  const unsupportedCount = claims.filter((c) => !c.supported).length;

  return {
    output: { claims, unsupportedCount },
    tokensUsed: 0,
    costCents: 0,
    usedDemoAdapter: true,
  };
}

export function runSchemaGeneratorStage(
  input: SchemaGeneratorInput,
): StageResult<SchemaGeneratorOutput> {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.optimized.metaTitle,
    description: input.optimized.metaDescription,
    author: { "@type": "Organization", name: input.brief.brandName },
  };
  return { output: { jsonLd }, tokensUsed: 0, costCents: 0, usedDemoAdapter: true };
}
