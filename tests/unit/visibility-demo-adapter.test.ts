import { describe, it, expect } from "vitest";
import { createDemoVisibilityAdapter } from "@/lib/ai/visibility/demo-adapter";
import { AI_PLATFORM_KEYS } from "@/lib/ai/visibility/adapter";

describe("createDemoVisibilityAdapter", () => {
  it("is deterministic: same platform+prompt+brand always produces the same result", async () => {
    const adapter = createDemoVisibilityAdapter("chatgpt");
    const first = await adapter.check("best detangling brush", "Curl Co");
    const second = await adapter.check("best detangling brush", "Curl Co");
    expect(first).toEqual(second);
  });

  it("produces different results for different brands", async () => {
    const adapter = createDemoVisibilityAdapter("chatgpt");
    const a = await adapter.check("best detangling brush", "Curl Co");
    const b = await adapter.check("best detangling brush", "Rival Brand");
    expect(a.rawResponse).not.toEqual(b.rawResponse);
  });

  it("always labels results as demo", async () => {
    for (const platform of AI_PLATFORM_KEYS) {
      const adapter = createDemoVisibilityAdapter(platform);
      const result = await adapter.check("best hair brush", "Curl Co");
      expect(result.isDemo).toBe(true);
      expect(result.platform).toBe(platform);
    }
  });

  it("produces a valid confidence value in [0, 1] for every platform", async () => {
    for (const platform of AI_PLATFORM_KEYS) {
      const adapter = createDemoVisibilityAdapter(platform);
      const result = await adapter.check("best hair brush", "Curl Co");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("when mentioned, reports a position between 1 and 4", async () => {
    // Try several brand names to find at least one deterministic
    // "mentioned" case, then assert its position bounds.
    const adapter = createDemoVisibilityAdapter("gemini");
    const candidates = ["Curl Co", "Silky Brand", "Tween Glow", "Detangle Pro"];
    let foundMentioned = false;
    for (const brand of candidates) {
      const result = await adapter.check("best detangling brush", brand);
      if (result.mentioned && result.position !== null) {
        foundMentioned = true;
        expect(result.position).toBeGreaterThanOrEqual(1);
        expect(result.position).toBeLessThanOrEqual(4);
      }
    }
    expect(foundMentioned).toBe(true);
  });
});
