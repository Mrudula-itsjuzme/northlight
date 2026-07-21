import { describe, it, expect } from "vitest";
import { generateGapReport } from "@/lib/competitors/gap-analysis";
import { gapReportTypes } from "@/lib/validation/competitors";

describe("generateGapReport", () => {
  const brandId = "brand-1";
  const competitorId = "competitor-1";

  it("is deterministic: same brand+competitor+type always produces the same result", () => {
    const first = generateGapReport(brandId, competitorId, "content");
    const second = generateGapReport(brandId, competitorId, "content");
    expect(first).toEqual(second);
  });

  it("produces different findings for different competitors", () => {
    const a = generateGapReport(brandId, "competitor-a", "content");
    const b = generateGapReport(brandId, "competitor-b", "content");
    expect(a).not.toEqual(b);
  });

  it("produces different findings for different brands (same competitor)", () => {
    const a = generateGapReport("brand-a", competitorId, "content");
    const b = generateGapReport("brand-b", competitorId, "content");
    expect(a).not.toEqual(b);
  });

  it("produces 2-4 findings per report", () => {
    for (const type of gapReportTypes) {
      const result = generateGapReport(brandId, competitorId, type);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      expect(result.findings.length).toBeLessThanOrEqual(4);
    }
  });

  it("produces a priority score in [0, 1]", () => {
    for (const type of gapReportTypes) {
      const result = generateGapReport(brandId, competitorId, type);
      expect(result.priorityScore).toBeGreaterThanOrEqual(0);
      expect(result.priorityScore).toBeLessThanOrEqual(1);
    }
  });

  it("covers all 5 gap report types without throwing", () => {
    expect(gapReportTypes).toEqual(["content", "schema", "faq", "backlink", "ai_citation"]);
    for (const type of gapReportTypes) {
      const result = generateGapReport(brandId, competitorId, type);
      expect(result.type).toBe(type);
      expect(result.findings.length).toBeGreaterThan(0);
    }
  });

  it("does not repeat the same finding twice within one report", () => {
    const result = generateGapReport(brandId, competitorId, "faq");
    const titles = result.findings.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("labels every finding with a valid severity", () => {
    const result = generateGapReport(brandId, competitorId, "backlink");
    for (const finding of result.findings) {
      expect(["low", "medium", "high"]).toContain(finding.severity);
    }
  });

  it("the ai_citation report explicitly disclaims itself as directional-only, never claiming to BE an official citation count", () => {
    const result = generateGapReport(brandId, competitorId, "ai_citation");
    const allText = result.findings.map((f) => f.description).join(" ").toLowerCase();
    // Must contain the disclaimer ("not a[n] official citation count"),
    // and must never assert the positive claim ("is an official citation
    // count") without the negation immediately before it.
    expect(allText).toMatch(/directional signal only/);
    expect(allText).toMatch(/not an? official citation count/);
    expect(allText).not.toMatch(/(?<!not an? )official citation count/);
  });
});
