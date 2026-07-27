import type { AiPlatformKey, VisibilityAdapter, VisibilityCheckResult, Sentiment } from "@/lib/ai/visibility/adapter";
import { parseVisibilityResponse } from "@/lib/ai/visibility/parse";
import { config } from "@/lib/config";

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededFloat(seed: string): number {
  return fnv1a(seed) / 0xffffffff;
}

const COMPETITOR_NAMES = config.brand.demoCompetitors;

function buildDemoResponseText(platform: AiPlatformKey, prompt: string, brandName: string): string {
  const seed = `${platform}:${prompt}:${brandName}`;
  const mentionRoll = seededFloat(`${seed}:mention`);
  const mentioned = mentionRoll > 0.3;

  if (!mentioned) {
    return `Here are some popular options for "${prompt}":\n1. ${COMPETITOR_NAMES[0]}\n2. ${COMPETITOR_NAMES[1]}\n3. ${COMPETITOR_NAMES[2]}`;
  }

  const positionRoll = seededFloat(`${seed}:position`);
  const position = 1 + Math.floor(positionRoll * 4);

  const sentimentRoll = seededFloat(`${seed}:sentiment`);
  const sentimentPhrase: Record<Sentiment, string> =
    sentimentRoll > 0.66
      ? { positive: "an excellent, highly recommended choice", neutral: "", negative: "", unknown: "" }
      : sentimentRoll > 0.33
        ? { positive: "", neutral: "a solid option worth considering", negative: "", unknown: "" }
        : { positive: "", neutral: "", negative: "though some reviews mention it can be overpriced", unknown: "" };
  const phrase = sentimentPhrase.positive || sentimentPhrase.neutral || sentimentPhrase.negative;

  const otherBrands = COMPETITOR_NAMES.filter((_, i) => i !== position - 1).slice(0, 3);
  const lines: string[] = [];
  let otherIdx = 0;
  for (let i = 1; i <= 4; i++) {
    if (i === position) {
      lines.push(`${i}. ${brandName} — ${phrase}`);
    } else {
      lines.push(`${i}. ${otherBrands[otherIdx++ % otherBrands.length]}`);
    }
  }

  return `Here are some popular options for "${prompt}":\n${lines.join("\n")}`;
}

export function createDemoVisibilityAdapter(platform: AiPlatformKey): VisibilityAdapter {
  return {
    platform,
    isDemo: true,
    adapterState: "demo",
    async check(prompt: string, brandName: string): Promise<VisibilityCheckResult> {
      const startTime = Date.now();
      const rawResponse = buildDemoResponseText(platform, prompt, brandName);
      const parsed = parseVisibilityResponse(rawResponse, brandName);
      return {
        platform,
        adapterState: "demo",
        mentioned: parsed.mentioned,
        position: parsed.position,
        sentiment: parsed.sentiment,
        confidence: parsed.confidence,
        rawResponse,
        isDemo: true,
        model: "demo-heuristic",
        latencyMs: Date.now() - startTime,
      };
    },
  };
}

export function createUnavailableVisibilityAdapter(platform: AiPlatformKey): VisibilityAdapter {
  return {
    platform,
    isDemo: false,
    adapterState: "unavailable",
    async check(): Promise<VisibilityCheckResult> {
      return {
        platform,
        adapterState: "unavailable",
        mentioned: false,
        position: null,
        sentiment: "unknown",
        confidence: 0,
        rawResponse: `Provider integration for '${platform}' is unavailable (no API configured).`,
        isDemo: false,
        model: "none",
        latencyMs: 0,
      };
    },
  };
}
