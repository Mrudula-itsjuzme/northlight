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
import { auditContentQuality, extractSectionsFromHtml } from "@/lib/content/self-review";
import { DemoPublishingAdapter } from "@/lib/publishing/adapters";

function computeFleschReadingEase(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(Boolean);

  if (words.length === 0 || sentences.length === 0) return 100;

  const totalSyllables = words.reduce((sum, w) => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, "");
    if (!clean) return sum;
    if (clean.length <= 3) return sum + 1;
    const matches = clean.match(/[aeiouy]{1,2}/gi);
    let count = matches ? matches.length : 1;
    if (clean.endsWith("e") && !clean.endsWith("le") && count > 1) count--;
    return sum + Math.max(1, count);
  }, 0);

  const asl = words.length / sentences.length;
  const asw = totalSyllables / words.length;
  const score = 206.835 - 1.015 * asl - 84.6 * asw;
  return Number(Math.max(0, Math.min(100, score)).toFixed(1));
}

type ArticleRunReport = {
  id: number;
  topic: string;
  brandName: string;
  crossSectionSimilarity: number;
  duplicateSentenceCount: number;
  wordCount: number;
  readabilityScore: number;
  allParagraphsUnique: boolean;
  paragraphCount: number;
  publicationDestination: string;
  publishedUrl: string;
  publishedReason: string;
  htmlOutput: string;
};

describe("Generate 10 Benchmark Articles via New Pipeline", () => {
  it("runs 10 articles and computes metrics", async () => {
    const topics = [
      { primaryKeyword: "Serverless Microservices Architecture", brandName: "TechStack Cloud" },
      { primaryKeyword: "RAG Pipeline Optimization & Vector Search", brandName: "NeuralAI Systems" },
      { primaryKeyword: "Zero Trust Network Access (ZTNA) Protocols", brandName: "ArmorNet Security" },
      { primaryKeyword: "GitOps CI/CD Deployment Telemetry", brandName: "OpsFlow Telemetry" },
      { primaryKeyword: "Real-Time Event Stream Processing", brandName: "DataPulse Engine" },
      { primaryKeyword: "Product-Led Growth Retention Metrics", brandName: "SaaSify Metric" },
      { primaryKeyword: "Web Performance & Core Web Vitals Optimization", brandName: "SpeedBoost Web" },
      { primaryKeyword: "HIPAA-Compliant Cloud Data Storage", brandName: "HealthVault Cloud" },
      { primaryKeyword: "Real-Time Payment Fraud Prevention", brandName: "FinGuard Tech" },
      { primaryKeyword: "Headless CMS Architecture for Scalable E-Commerce", brandName: "CommerceCore" },
    ];

    const reports: ArticleRunReport[] = [];
    const demoAdapter = new DemoPublishingAdapter();

    for (let i = 0; i < topics.length; i++) {
      const { primaryKeyword, brandName } = topics[i];
      const brief = {
        primaryKeyword,
        supportingKeywords: [`${primaryKeyword} best practices`, `${primaryKeyword} benchmarks`],
        brandName,
      };

      const research = await runResearchStage({ brief });
      const strategy = await runStrategyStage({ brief, research: research.output });
      const outline = await runOutlineStage({ brief, strategy: strategy.output });
      const writer = await runWriterStage({ brief, outline: outline.output });
      const editor = await runEditorStage({ draft: writer.output });
      const selfReview = await runSelfReviewStage({ edited: editor.output });
      const seo = await runSeoOptimizerStage({ brief, edited: selfReview.output });

      const bodyHtml = seo.output.bodyHtml;
      const audit = auditContentQuality(bodyHtml);
      const wordCount = bodyHtml.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      const readabilityScore = computeFleschReadingEase(bodyHtml);
      const sections = extractSectionsFromHtml(bodyHtml);
      
      let totalParagraphs = 0;
      for (const sec of sections) {
        totalParagraphs += sec.paragraphs.length;
      }

      // Check if each paragraph introduces unique insight (no paragraph repetition)
      const allParagraphsUnique = audit.repeatedSentences.length === 0 && audit.maxSectionSimilarity < 0.2;

      // Simulate publishing via adapter
      const pubResult = await demoAdapter.publish({
        id: `art-bench-${i + 1}`,
        title: seo.output.metaTitle,
        slug: seo.output.slug,
        contentHtml: bodyHtml,
      });

      reports.push({
        id: i + 1,
        topic: primaryKeyword,
        brandName,
        crossSectionSimilarity: audit.maxSectionSimilarity,
        duplicateSentenceCount: audit.repeatedSentences.length,
        wordCount,
        readabilityScore,
        allParagraphsUnique,
        paragraphCount: totalParagraphs,
        publicationDestination: demoAdapter.destination,
        publishedUrl: pubResult.publishedUrl,
        publishedReason: "Published via Demo Adapter (returns configured demo site URL). External Webhook/CMS destinations push live via POST endpoint when targetUrl and credentials are provided in PublishOptions.",
        htmlOutput: bodyHtml,
      });
    }

    console.log("=== 10 ARTICLE PIPELINE REPORT ===");
    console.log(JSON.stringify(reports, null, 2));

    expect(reports).toHaveLength(10);
    for (const r of reports) {
      expect(r.crossSectionSimilarity).toBeLessThan(0.2);
      expect(r.duplicateSentenceCount).toBe(0);
      expect(r.wordCount).toBeGreaterThan(100);
    }
  });
});
