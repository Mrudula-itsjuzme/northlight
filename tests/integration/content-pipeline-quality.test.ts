import { describe, it, expect } from "vitest";
import {
  runResearchStage,
  runStrategyStage,
  runOutlineStage,
  runWriterStage,
  runEditorStage,
  runSelfReviewStage,
  runSeoOptimizerStage,
} from "@/lib/content/pipeline/stages";
import { auditContentQuality } from "@/lib/content/self-review";

describe("Content Generation Pipeline Quality & Anti-Repetition", () => {
  it("executes complete stage workflow without repetition or generic fluff", async () => {
    const brief = {
      primaryKeyword: "AI Visibility Engine",
      supportingKeywords: ["search tracking", "LLM ranking", "prompt monitoring"],
      brandName: "Northlight",
      targetAudience: "Enterprise Content Strategists",
    };

    // Stage 1: Research
    const researchRes = await runResearchStage({ brief });
    expect(researchRes.output.keyFacts.length).toBeGreaterThan(0);

    // Stage 2: Strategy
    const strategyRes = await runStrategyStage({ brief, research: researchRes.output });
    expect(strategyRes.output.angle).toBeTruthy();

    // Stage 3: Outline
    const outlineRes = await runOutlineStage({ brief, strategy: strategyRes.output });
    expect(outlineRes.output.headings.length).toBe(8);

    // Stage 4: Writer
    const writerRes = await runWriterStage({ brief, outline: outlineRes.output });
    expect(writerRes.output.wordCount).toBeGreaterThan(50);

    // Stage 5: Editor
    const editorRes = await runEditorStage({ draft: writerRes.output });
    expect(editorRes.output.bodyHtml).toBeTruthy();

    // Stage 6: Self-Review
    const selfReviewRes = await runSelfReviewStage({ edited: editorRes.output });
    expect(selfReviewRes.output.maxSectionSimilarity).toBeLessThan(0.2);
    expect(selfReviewRes.output.qualityPass).toBe(true);

    // Stage 7: SEO Optimizer
    const seoRes = await runSeoOptimizerStage({ brief, edited: selfReviewRes.output });
    expect(seoRes.output.metaTitle).toBeTruthy();
    expect(seoRes.output.metaDescription).toBeTruthy();

    // Audit final generated HTML
    const finalAudit = auditContentQuality(seoRes.output.bodyHtml);
    expect(finalAudit.maxSectionSimilarity).toBeLessThan(0.2);
    expect(finalAudit.fluffPhrases).toHaveLength(0);
  });
});
