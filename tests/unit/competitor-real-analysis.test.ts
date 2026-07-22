import { describe, it, expect } from "vitest";
import { analyzeRealPageSignals, isRealAnalysisSupported } from "@/lib/competitors/real-analysis";
import type { PageSignals } from "@/lib/competitors/fetch-adapter";

function signals(overrides: Partial<PageSignals> = {}): PageSignals {
  return {
    url: "https://example.com/page",
    metaTitle: "Example",
    metaDescription: null,
    headingCounts: { h1: 1, h2: 2, h3: 0 },
    jsonLdTypes: [],
    hasFaqPattern: false,
    wordCount: 500,
    internalLinkCount: 5,
    ...overrides,
  };
}

describe("isRealAnalysisSupported", () => {
  it("supports content, schema, and faq only", () => {
    expect(isRealAnalysisSupported("content")).toBe(true);
    expect(isRealAnalysisSupported("schema")).toBe(true);
    expect(isRealAnalysisSupported("faq")).toBe(true);
    expect(isRealAnalysisSupported("backlink")).toBe(false);
    expect(isRealAnalysisSupported("ai_citation")).toBe(false);
  });
});

describe("analyzeRealPageSignals", () => {
  it("throws for an unsupported type rather than silently degrading", () => {
    expect(() => analyzeRealPageSignals(signals(), "backlink")).toThrow();
    expect(() => analyzeRealPageSignals(signals(), "ai_citation")).toThrow();
  });

  it("reports high severity for pages with multiple JSON-LD types", () => {
    const result = analyzeRealPageSignals(
      signals({ jsonLdTypes: ["Product", "FAQPage", "BreadcrumbList"] }),
      "schema",
    );
    expect(result.type).toBe("schema");
    expect(result.findings.length).toBe(3);
    expect(result.findings.every((f) => f.severity === "high")).toBe(true);
  });

  it("reports a low-severity neutral finding when no schema is present", () => {
    const result = analyzeRealPageSignals(signals({ jsonLdTypes: [] }), "schema");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("low");
  });

  it("reports high severity FAQ finding when hasFaqPattern is true", () => {
    const result = analyzeRealPageSignals(signals({ hasFaqPattern: true }), "faq");
    expect(result.findings[0].severity).toBe("high");
  });

  it("reports low severity when no FAQ pattern detected", () => {
    const result = analyzeRealPageSignals(signals({ hasFaqPattern: false }), "faq");
    expect(result.findings[0].severity).toBe("low");
  });

  it("flags long-form content as a high-severity content-depth finding", () => {
    const result = analyzeRealPageSignals(signals({ wordCount: 2000 }), "content");
    expect(result.findings.some((f) => f.severity === "high")).toBe(true);
  });

  it("flags missing/multiple H1 as an observation", () => {
    const result = analyzeRealPageSignals(
      signals({ headingCounts: { h1: 0, h2: 2, h3: 0 }, wordCount: 100 }),
      "content",
    );
    expect(result.findings.some((f) => f.title.toLowerCase().includes("missing an h1"))).toBe(true);
  });

  it("produces a priorityScore between 0 and 1", () => {
    for (const type of ["content", "schema", "faq"] as const) {
      const result = analyzeRealPageSignals(signals(), type);
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(1);
    }
  });
});
