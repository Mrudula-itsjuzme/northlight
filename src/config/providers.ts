import "server-only";

export type ProviderCapabilities = {
  supportsEmbeddings: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
};

export type ModelCostRate = {
  promptRatePer1MCents: number;
  completionRatePer1MCents: number;
};

export type ProviderDefinition = {
  id: string;
  displayName: string;
  priority: number;
  capabilities: ProviderCapabilities;
  defaultModel: string;
  models: Record<string, ModelCostRate>;
};

export const PROVIDER_REGISTRY: Record<string, ProviderDefinition> = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    priority: 1,
    capabilities: {
      supportsEmbeddings: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    defaultModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    models: {
      "gpt-4o-mini": { promptRatePer1MCents: 15, completionRatePer1MCents: 60 },
      "gpt-4o": { promptRatePer1MCents: 250, completionRatePer1MCents: 1000 },
      "o3-mini": { promptRatePer1MCents: 110, completionRatePer1MCents: 440 },
      "o1-mini": { promptRatePer1MCents: 300, completionRatePer1MCents: 1200 },
      "gpt-4-turbo": { promptRatePer1MCents: 1000, completionRatePer1MCents: 3000 },
      "text-embedding-3-small": { promptRatePer1MCents: 2, completionRatePer1MCents: 0 },
    },
  },
  demo_hash: {
    id: "demo_hash",
    displayName: "Demo Heuristic Adapter",
    priority: 99,
    capabilities: {
      supportsEmbeddings: true,
      supportsVision: false,
      supportsReasoning: false,
    },
    defaultModel: "demo-heuristic",
    models: {
      "demo-heuristic": { promptRatePer1MCents: 0, completionRatePer1MCents: 0 },
    },
  },
  claude: {
    id: "claude",
    displayName: "Anthropic Claude",
    priority: 2,
    capabilities: {
      supportsEmbeddings: false,
      supportsVision: true,
      supportsReasoning: true,
    },
    defaultModel: "claude-3-5-sonnet",
    models: {
      "claude-3-5-sonnet": { promptRatePer1MCents: 300, completionRatePer1MCents: 1500 },
      "claude-3-haiku": { promptRatePer1MCents: 25, completionRatePer1MCents: 125 },
    },
  },
  gemini: {
    id: "gemini",
    displayName: "Google Gemini",
    priority: 3,
    capabilities: {
      supportsEmbeddings: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    defaultModel: "gemini-1.5-flash",
    models: {
      "gemini-1.5-flash": { promptRatePer1MCents: 7.5, completionRatePer1MCents: 30 },
      "gemini-1.5-pro": { promptRatePer1MCents: 125, completionRatePer1MCents: 500 },
    },
  },
  perplexity: {
    id: "perplexity",
    displayName: "Perplexity AI",
    priority: 4,
    capabilities: {
      supportsEmbeddings: false,
      supportsVision: false,
      supportsReasoning: true,
    },
    defaultModel: "sonar-reasoning",
    models: {
      "sonar-reasoning": { promptRatePer1MCents: 100, completionRatePer1MCents: 500 },
    },
  },
  copilot: {
    id: "copilot",
    displayName: "Microsoft Copilot",
    priority: 5,
    capabilities: {
      supportsEmbeddings: false,
      supportsVision: true,
      supportsReasoning: true,
    },
    defaultModel: "copilot-gpt4o",
    models: {
      "copilot-gpt4o": { promptRatePer1MCents: 250, completionRatePer1MCents: 1000 },
    },
  },
  ai_overviews: {
    id: "ai_overviews",
    displayName: "Google AI Overviews",
    priority: 6,
    capabilities: {
      supportsEmbeddings: false,
      supportsVision: false,
      supportsReasoning: true,
    },
    defaultModel: "google-aio-v1",
    models: {
      "google-aio-v1": { promptRatePer1MCents: 0, completionRatePer1MCents: 0 },
    },
  },
};

export function getProvider(providerId: string): ProviderDefinition {
  const provider = PROVIDER_REGISTRY[providerId];
  if (!provider) {
    throw new Error(`Unknown AI provider '${providerId}' in Provider Registry.`);
  }
  return provider;
}

export function calculateModelCostCents(
  model: string,
  promptTokens: number,
  completionTokens: number,
  providerId = "openai",
): number {
  const provider = PROVIDER_REGISTRY[providerId] || PROVIDER_REGISTRY.openai;
  const modelRates = provider.models[model] || provider.models[provider.defaultModel] || {
    promptRatePer1MCents: 15,
    completionRatePer1MCents: 60,
  };

  const promptCostCents = (promptTokens / 1_000_000) * modelRates.promptRatePer1MCents;
  const completionCostCents = (completionTokens / 1_000_000) * modelRates.completionRatePer1MCents;
  return Number((promptCostCents + completionCostCents).toFixed(4));
}
