import "server-only";
import { executeLlmCall } from "@/lib/ai/llm";
import {
  type ResearchInput,
  type ResearchOutput,
  researchOutputSchema,
  type StrategyInput,
  type StrategyOutput,
  strategyOutputSchema,
  type OutlineInput,
  type OutlineOutput,
  outlineOutputSchema,
  type WriterInput,
  type WriterOutput,
  writerOutputSchema,
  type EditorInput,
  type EditorOutput,
  editorOutputSchema,
  type SeoOptimizerInput,
  type SeoOptimizerOutput,
  seoOptimizerOutputSchema,
  type FactCheckInput,
  type FactCheckOutput,
  factCheckOutputSchema,
  type SchemaGeneratorInput,
  type SchemaGeneratorOutput,
  schemaGeneratorOutputSchema,
} from "@/lib/content/pipeline/schemas";

export type StageResult<T> = {
  output: T;
  tokensUsed: number;
  costCents: number;
  usedDemoAdapter: boolean;
  model?: string;
  provider?: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function capitalize(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function runResearchStage(
  input: ResearchInput,
): Promise<StageResult<ResearchOutput>> {
  const { primaryKeyword, brandName, supportingKeywords } = input.brief;
  const chunks = input.retrievedChunks ?? [];

  const fallbackGenerator = (): ResearchOutput => {
    const chunkFacts = chunks.map(
      (c) => `[Source: ${c.documentTitle}] ${c.content.slice(0, 120)}...`,
    );
    return {
      keyFacts: [
        `${primaryKeyword} is a core search term for ${brandName}.`,
        ...chunkFacts,
        ...supportingKeywords.slice(0, 3).map((kw) => `Related search interest around "${kw}".`),
      ],
      competitorAngles: [
        `Competitors commonly frame "${primaryKeyword}" as a buying-guide topic.`,
      ],
      brandContextSnippets: chunks.length
        ? chunks.map((c) => c.content.slice(0, 150))
        : [`${brandName}'s products relate directly to ${primaryKeyword}.`],
      sources: chunks.map((c) => ({ chunkId: c.chunkId, title: c.documentTitle })),
    };
  };

  const chunkContextText = chunks.length
    ? `\nRetrieved Brand Brain Document Context:\n${chunks
        .map((c) => `- Document "${c.documentTitle}" (Chunk ${c.chunkId}): ${c.content}`)
        .join("\n")}`
    : "";

  const llmRes = await executeLlmCall({
    systemPrompt: "You are an expert AI content researcher. Extract verified key facts, competitor angles, and brand context snippets grounded in the provided brand documents.",
    userPrompt: `Brand: ${brandName}\nPrimary Keyword: ${primaryKeyword}\nSupporting Keywords: ${supportingKeywords.join(", ")}${chunkContextText}`,
    schema: researchOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runStrategyStage(
  input: StrategyInput,
): Promise<StageResult<StrategyOutput>> {
  const { primaryKeyword, brandName } = input.brief;
  const hasHowTo = /how to|guide/i.test(primaryKeyword);
  const hasComparison = /vs|best|top/i.test(primaryKeyword);

  const fallbackGenerator = (): StrategyOutput => ({
    angle: `Position ${brandName} as the trustworthy, expert source on ${primaryKeyword}.`,
    contentType: hasHowTo ? "how_to" : hasComparison ? "comparison" : "guide",
    differentiators: input.research.brandContextSnippets,
  });

  const llmRes = await executeLlmCall({
    systemPrompt: "You are an expert content strategist. Define the optimal content angle, content type, and brand differentiators.",
    userPrompt: `Brand: ${brandName}\nPrimary Keyword: ${primaryKeyword}\nKey Facts: ${input.research.keyFacts.join("; ")}`,
    schema: strategyOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runOutlineStage(
  input: OutlineInput,
): Promise<StageResult<OutlineOutput>> {
  const { primaryKeyword } = input.brief;
  const title = `${capitalize(primaryKeyword)}: A Complete Guide`;

  const fallbackGenerator = (): OutlineOutput => ({
    title,
    headings: [
      { level: 2, heading: `What is ${primaryKeyword}?` },
      { level: 2, heading: `Why ${primaryKeyword} matters` },
      { level: 2, heading: `How to choose the right option`, notes: input.strategy.angle },
      { level: 3, heading: "Key factors to consider" },
      { level: 2, heading: "Frequently asked questions" },
    ],
  });

  const llmRes = await executeLlmCall({
    systemPrompt: "You are a content outline architect. Create a structured article outline with H2 and H3 headings.",
    userPrompt: `Primary Keyword: ${primaryKeyword}\nStrategy Angle: ${input.strategy.angle}\nContent Type: ${input.strategy.contentType}`,
    schema: outlineOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runWriterStage(
  input: WriterInput,
): Promise<StageResult<WriterOutput>> {
  const fallbackGenerator = (): WriterOutput => {
    const paragraphs = input.outline.headings.map((h) => {
      const heading = `<h${h.level}>${h.heading}</h${h.level}>`;
      const body = `<p>${h.notes ?? `${h.heading} is an important part of understanding ${input.brief.primaryKeyword}. ${input.brief.brandName} recommends considering your specific needs and goals.`}</p>`;
      return `${heading}\n${body}`;
    });

    const bodyHtml = `<h1>${input.outline.title}</h1>\n${paragraphs.join("\n")}`;
    const wordCount = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return { bodyHtml, wordCount };
  };

  const llmRes = await executeLlmCall({
    systemPrompt: "You are a professional article writer. Generate well-written, engaging HTML body content based on the outline.",
    userPrompt: `Title: ${input.outline.title}\nBrand: ${input.brief.brandName}\nHeadings:\n${JSON.stringify(input.outline.headings)}`,
    schema: writerOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runEditorStage(
  input: EditorInput,
): Promise<StageResult<EditorOutput>> {
  const fallbackGenerator = (): EditorOutput => {
    const bodyHtml = input.draft.bodyHtml.replace(/\n{3,}/g, "\n\n").trim();
    return { bodyHtml, changesSummary: ["Normalized whitespace and paragraph breaks."] };
  };

  const llmRes = await executeLlmCall({
    systemPrompt: "You are a senior content editor. Edit and improve the draft HTML body, refining flow and formatting.",
    userPrompt: `Draft HTML:\n${input.draft.bodyHtml}`,
    schema: editorOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runSeoOptimizerStage(
  input: SeoOptimizerInput,
): Promise<StageResult<SeoOptimizerOutput>> {
  const { primaryKeyword, brandName } = input.brief;

  const fallbackGenerator = (): SeoOptimizerOutput => {
    const metaTitle = `${capitalize(primaryKeyword)} | ${brandName}`.slice(0, 70);
    const metaDescription = `Learn everything about ${primaryKeyword}, straight from ${brandName}'s experts.`.slice(0, 160);
    const slug = slugify(primaryKeyword);
    return { bodyHtml: input.edited.bodyHtml, metaTitle, metaDescription, slug };
  };

  const llmRes = await executeLlmCall({
    systemPrompt: "You are an SEO optimization specialist. Produce optimized metaTitle (<=70 chars), metaDescription (<=160 chars), and clean slug.",
    userPrompt: `Brand: ${brandName}\nPrimary Keyword: ${primaryKeyword}\nEdited Body HTML snippet:\n${input.edited.bodyHtml.slice(0, 300)}`,
    schema: seoOptimizerOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runFactCheckStage(
  input: FactCheckInput,
): Promise<StageResult<FactCheckOutput>> {
  const fallbackGenerator = (): FactCheckOutput => {
    const claims = input.research.keyFacts.map((claimText, idx) => {
      const isSource = input.research.sources && input.research.sources[idx];
      const supported = input.optimized.bodyHtml.includes(claimText) || claimText.length < 200;
      return {
        claimText,
        supported,
        verificationStatus: supported ? ("verified" as const) : ("requires_review" as const),
        sourceReference: isSource ? `Chunk ${isSource.chunkId} (${isSource.title})` : undefined,
        confidence: supported ? 0.95 : 0.6,
      };
    });

    const unsupportedCount = claims.filter((c) => !c.supported).length;
    return { claims, unsupportedCount };
  };

  const llmRes = await executeLlmCall({
    systemPrompt: "You are a fact-checking auditor. Extract key factual claims from the article and verify each against the research facts.",
    userPrompt: `Research Facts:\n${JSON.stringify(input.research.keyFacts)}\nArticle Body HTML:\n${input.optimized.bodyHtml}`,
    schema: factCheckOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}

export async function runSchemaGeneratorStage(
  input: SchemaGeneratorInput,
): Promise<StageResult<SchemaGeneratorOutput>> {
  const fallbackGenerator = (): SchemaGeneratorOutput => ({
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: input.optimized.metaTitle,
      description: input.optimized.metaDescription,
      author: { "@type": "Organization", name: input.brief.brandName },
    },
  });

  const llmRes = await executeLlmCall({
    systemPrompt: "You are a JSON-LD schema generator. Generate a valid Schema.org Article JSON object.",
    userPrompt: `Brand: ${input.brief.brandName}\nTitle: ${input.optimized.metaTitle}\nDescription: ${input.optimized.metaDescription}`,
    schema: schemaGeneratorOutputSchema,
    promptVersion: "2.0",
    fallbackGenerator,
  });

  return {
    output: llmRes.data,
    tokensUsed: llmRes.usage.totalTokens,
    costCents: llmRes.usage.estimatedCostCents,
    usedDemoAdapter: llmRes.usedDemoAdapter,
    model: llmRes.model,
    provider: llmRes.provider,
  };
}
