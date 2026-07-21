import { describe, it, expect } from "vitest";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";

describe("parseVisibilityResponse", () => {
  it("detects no mention when the brand name never appears", () => {
    const text = "Here are some popular options:\n1. Rivalia\n2. Glowmane\n3. Silkcurl Co";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.mentioned).toBe(false);
    expect(result.position).toBeNull();
    expect(result.sentiment).toBe("unknown");
  });

  it("detects a mention and extracts its 1-based list position", () => {
    const text = "Top picks:\n1. Rivalia\n2. Curl Co — a great choice\n3. Glowmane";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.mentioned).toBe(true);
    expect(result.position).toBe(2);
  });

  it("classifies positive sentiment from nearby positive words", () => {
    const text = "1. Curl Co is an excellent, highly recommended brand for curly hair.";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.sentiment).toBe("positive");
  });

  it("classifies negative sentiment from nearby negative words", () => {
    const text = "1. Curl Co — some reviews say it's overpriced and unreliable.";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.sentiment).toBe("negative");
  });

  it("classifies neutral sentiment when there's no strong signal either way", () => {
    const text = "1. Curl Co offers hair care products.";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.sentiment).toBe("neutral");
  });

  it("returns null position when the brand is mentioned in prose without a numbered list", () => {
    const text = "Many parents love Curl Co for detangling brushes.";
    const result = parseVisibilityResponse(text, "Curl Co");
    expect(result.mentioned).toBe(true);
    expect(result.position).toBeNull();
  });

  it("is case-insensitive when matching the brand name", () => {
    const text = "1. CURL CO is a great pick.";
    const result = parseVisibilityResponse(text, "curl co");
    expect(result.mentioned).toBe(true);
  });

  it("produces higher confidence when both position and sentiment are found", () => {
    const withBoth = parseVisibilityResponse(
      "1. Curl Co — an excellent, highly recommended choice",
      "Curl Co",
    );
    const withNeither = parseVisibilityResponse("Curl Co makes hair products.", "Curl Co");
    expect(withBoth.confidence).toBeGreaterThan(withNeither.confidence);
  });

  it("confidence is always within [0, 1]", () => {
    const cases = [
      "1. Curl Co — excellent and highly recommended, though some say overpriced",
      "Curl Co",
      "No mention of any brand here",
    ];
    for (const text of cases) {
      const result = parseVisibilityResponse(text, "Curl Co");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("high confidence (0.9) for a clean non-mention", () => {
    const result = parseVisibilityResponse("1. Rivalia\n2. Glowmane", "Curl Co");
    expect(result.confidence).toBe(0.9);
  });
});
