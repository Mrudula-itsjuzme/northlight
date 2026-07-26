import { describe, it, expect } from "vitest";
import {
  runResearchStage,
  runStrategyStage,
  runOutlineStage,
  runWriterStage,
  runEditorStage,
  runSeoOptimizerStage,
  runFactCheckStage,
  runSchemaGeneratorStage,
} from "@/lib/content/pipeline/stages";
import {
  researchOutputSchema,
  strategyOutputSchema,
  outlineOutputSchema,
  writerOutputSchema,
  editorOutputSchema,
  seoOptimizerOutputSchema,
  factCheckOutputSchema,
  schemaGeneratorOutputSchema,
  type BriefContext,
} from "@/lib/content/pipeline/schemas";

const brief: BriefContext = {
  primaryKeyword: "detangling brush for kids",
  supportingKeywords: ["curly hair brush", "gentle detangler"],
  targetAudience: "parents of tweens",
  searchIntent: "commercial",
  brandName: "Curl Co",
};

describe("runResearchStage", () => {
  it("produces output matching researchOutputSchema", async () => {
    const result = await runResearchStage({ brief });
    expect(researchOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.keyFacts.length).toBeGreaterThan(0);
    expect(result.usedDemoAdapter).toBe(true);
  });

  it("incorporates supporting keywords into key facts", async () => {
    const result = await runResearchStage({ brief });
    const allFacts = result.output.keyFacts.join(" ");
    expect(allFacts).toMatch(/curly hair brush|gentle detangler/);
  });
});

describe("runStrategyStage", () => {
  it("produces output matching strategyOutputSchema", async () => {
    const research = (await runResearchStage({ brief })).output;
    const result = await runStrategyStage({ brief, research });
    expect(strategyOutputSchema.safeParse(result.output).success).toBe(true);
  });

  it("classifies how-to keywords as how_to content type", async () => {
    const howToBrief = { ...brief, primaryKeyword: "how to detangle curly hair" };
    const research = (await runResearchStage({ brief: howToBrief })).output;
    const result = await runStrategyStage({ brief: howToBrief, research });
    expect(result.output.contentType).toBe("how_to");
  });

  it("classifies comparison keywords as comparison content type", async () => {
    const comparisonBrief = { ...brief, primaryKeyword: "best detangling brush" };
    const research = (await runResearchStage({ brief: comparisonBrief })).output;
    const result = await runStrategyStage({ brief: comparisonBrief, research });
    expect(result.output.contentType).toBe("comparison");
  });
});

describe("runOutlineStage", () => {
  it("produces output matching outlineOutputSchema with at least one heading", async () => {
    const research = (await runResearchStage({ brief })).output;
    const strategy = (await runStrategyStage({ brief, research })).output;
    const result = await runOutlineStage({ brief, strategy });
    expect(outlineOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.headings.length).toBeGreaterThan(0);
  });
});

describe("runWriterStage", () => {
  it("produces output matching writerOutputSchema with a positive word count", async () => {
    const research = (await runResearchStage({ brief })).output;
    const strategy = (await runStrategyStage({ brief, research })).output;
    const outline = (await runOutlineStage({ brief, strategy })).output;
    const result = await runWriterStage({ brief, outline });
    expect(writerOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.wordCount).toBeGreaterThan(0);
  });

  it("includes every outline heading in the generated HTML", async () => {
    const research = (await runResearchStage({ brief })).output;
    const strategy = (await runStrategyStage({ brief, research })).output;
    const outline = (await runOutlineStage({ brief, strategy })).output;
    const result = await runWriterStage({ brief, outline });
    for (const h of outline.headings) {
      expect(result.output.bodyHtml).toContain(h.heading);
    }
  });
});

describe("runEditorStage", () => {
  it("produces output matching editorOutputSchema", async () => {
    const draft = { bodyHtml: "<h1>Title</h1>\n\n\n\n<p>Body</p>", wordCount: 2 };
    const result = await runEditorStage({ draft });
    expect(editorOutputSchema.safeParse(result.output).success).toBe(true);
  });

  it("collapses excess blank lines", async () => {
    const draft = { bodyHtml: "<h1>Title</h1>\n\n\n\n<p>Body</p>", wordCount: 2 };
    const result = await runEditorStage({ draft });
    expect(result.output.bodyHtml).not.toMatch(/\n{3,}/);
  });
});

describe("runSeoOptimizerStage", () => {
  it("produces output matching seoOptimizerOutputSchema with valid length constraints", async () => {
    const edited = { bodyHtml: "<p>content</p>", changesSummary: [] };
    const result = await runSeoOptimizerStage({ brief, edited });
    expect(seoOptimizerOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.metaTitle.length).toBeLessThanOrEqual(70);
    expect(result.output.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it("produces a URL-safe slug", async () => {
    const edited = { bodyHtml: "<p>content</p>", changesSummary: [] };
    const result = await runSeoOptimizerStage({ brief, edited });
    expect(result.output.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("runFactCheckStage", () => {
  it("produces output matching factCheckOutputSchema", async () => {
    const research = (await runResearchStage({ brief })).output;
    const optimized = {
      bodyHtml: research.keyFacts[0],
      metaTitle: "Title",
      metaDescription: "Description",
      slug: "slug",
    };
    const result = await runFactCheckStage({ optimized, research });
    expect(factCheckOutputSchema.safeParse(result.output).success).toBe(true);
  });

  it("flags claims not present in the body as unsupported when they are long", async () => {
    const research = {
      keyFacts: [
        "A".repeat(250), // long, and NOT in the body -> unsupported
      ],
      competitorAngles: [],
      brandContextSnippets: [],
      sources: [],
    };
    const optimized = {
      bodyHtml: "<p>unrelated content</p>",
      metaTitle: "Title",
      metaDescription: "Description",
      slug: "slug",
    };
    const result = await runFactCheckStage({ optimized, research });
    expect(result.output.unsupportedCount).toBe(1);
    expect(result.output.claims[0].supported).toBe(false);
  });
});

describe("runSchemaGeneratorStage", () => {
  it("produces valid JSON-LD matching schemaGeneratorOutputSchema", async () => {
    const optimized = {
      bodyHtml: "<p>content</p>",
      metaTitle: "Title",
      metaDescription: "Description",
      slug: "slug",
    };
    const result = await runSchemaGeneratorStage({ brief, optimized });
    expect(schemaGeneratorOutputSchema.safeParse(result.output).success).toBe(true);
    expect(result.output.jsonLd["@type"]).toBe("Article");
    expect(result.output.jsonLd["@context"]).toBe("https://schema.org");
  });
});
