import { describe, it, expect } from "vitest";
import {
  calculateSectionSimilarity,
  detectGenericFluff,
  detectRepeatedSentences,
  auditContentQuality,
  autoCleanHtml,
} from "@/lib/content/self-review";

describe("Self-Review Engine", () => {
  it("calculates 3-gram section similarity accurately", () => {
    const textA = "Navigating AI visibility requires moving beyond outdated heuristics for modern enterprise teams.";
    const textB = "Navigating AI visibility requires moving beyond outdated heuristics for modern enterprise teams.";
    const textC = "Empirical data shows 68 percent of companies consider automation an operational priority.";

    const highSim = calculateSectionSimilarity(textA, textB);
    const lowSim = calculateSectionSimilarity(textA, textC);

    expect(highSim).toBeGreaterThan(0.9);
    expect(lowSim).toBeLessThan(0.2);
  });

  it("detects generic AI fluff phrases", () => {
    const html = "<p>In today's fast-paced digital world, it is a game-changer to delve into modern software architecture.</p>";
    const fluff = detectGenericFluff(html);

    expect(fluff).toContain("in today's fast-paced digital world");
    expect(fluff).toContain("delve into");
    expect(fluff).toContain("game-changer");
  });

  it("detects duplicate sentences across sections", () => {
    const html = `
      <h2>Section A</h2>
      <p>This is a unique critical operational insight for enterprise infrastructure.</p>
      <h2>Section B</h2>
      <p>This is a unique critical operational insight for enterprise infrastructure.</p>
    `;
    const dups = detectRepeatedSentences(html);
    expect(dups.length).toBeGreaterThan(0);
  });

  it("automatically cleans fluff and duplicate paragraphs", () => {
    const rawHtml = `
      <h2>Section 1</h2>
      <p>In today's fast-paced digital world, we analyze systemic performance.</p>
      <p>In today's fast-paced digital world, we analyze systemic performance.</p>
    `;
    const result = autoCleanHtml(rawHtml);
    expect(result.cleanedFluffCount).toBeGreaterThan(0);
    expect(result.removedParagraphsCount).toBeGreaterThan(0);
    expect(result.cleanedHtml).not.toContain("in today's fast-paced digital world");
  });

  it("produces comprehensive content quality audit report", () => {
    const html = `
      <h2>Introduction</h2>
      <p>Navigating modern content pipelines requires strict anti-repetition engines.</p>
      <h2>The Core Problem</h2>
      <p>Legacy systems suffer from generic fluff and repetitive section headings.</p>
    `;
    const audit = auditContentQuality(html);
    expect(audit.maxSectionSimilarity).toBeLessThan(0.2);
    expect(audit.flaggedSections.length).toEqual(0);
  });
});
