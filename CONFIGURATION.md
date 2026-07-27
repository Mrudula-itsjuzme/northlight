# Northlight System Configuration Reference (`CONFIGURATION.md`)

This document provides a comprehensive reference for all settings, environment variables, default values, allowed ranges, and purposes across the Northlight modular monolith configuration architecture (`src/config/`).

---

## Configuration Architecture

Northlight follows a 4-tier configuration hierarchy:

1. **Environment Variables**: Runtime overrides specified in `.env`, `.env.local`, or server environment.
2. **Database Overrides**: Tenant/brand-level settings or experiment profile assignments.
3. **Typed Configuration Modules**: Strongly-typed TypeScript configurations under `src/config/`.
4. **Safe Defaults**: Validated using Zod schemas at startup to guarantee runtime type safety and fail-fast initialization.

---

## Configuration Modules Reference

### 1. Provider Registry (`src/config/providers.ts`)

Defines all supported AI models, rates, priorities, and capabilities.

| Setting / Provider | Type / Capabilities | Prompt Rate / 1M | Completion Rate / 1M | Priority | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `openai` | Embeddings, Vision, Reasoning | $0.15 (mini) / $2.50 (4o) | $0.60 (mini) / $10.00 (4o) | 1 | Primary live LLM & Embeddings provider |
| `demo_hash` | Embeddings | $0.00 | $0.00 | 99 | Deterministic offline fallback adapter |
| `claude` | Vision, Reasoning | $3.00 (3.5 Sonnet) | $15.00 (3.5 Sonnet) | 2 | Anthropic Claude provider definition |
| `gemini` | Embeddings, Vision, Reasoning | $0.075 (1.5 Flash) | $0.30 (1.5 Flash) | 3 | Google Gemini provider definition |
| `perplexity` | Reasoning | $1.00 (Sonar) | $5.00 (Sonar) | 4 | Search-grounded reasoning provider |
| `copilot` | Vision, Reasoning | $2.50 | $10.00 | 5 | Microsoft Copilot provider definition |
| `ai_overviews` | Reasoning | $0.00 | $0.00 | 6 | Google AI Overviews provider definition |

---

### 2. AI Core Configuration (`src/config/ai.ts`)

| Environment Variable | Config Property | Allowed Values | Default Value | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `OPENAI_API_KEY` | `openai.apiKey` | Secret String | `undefined` | OpenAI authentication key |
| `OPENAI_CHAT_MODEL` | `openai.chatModel` | Valid model ID | `gpt-4o-mini` | Default chat model |
| `OPENAI_EMBEDDING_MODEL` | `openai.embeddingModel` | Valid model ID | `text-embedding-3-small` | Default vector embedding model |
| `OPENAI_API_BASE_URL` | `openai.apiBaseUrl` | URL String | `https://api.openai.com/v1` | OpenAI API endpoint base |
| `AI_EXECUTION_MODE` | `ai.executionMode` | `"live" \| "demo" \| "test"` | `"live"` (if key present) else `"demo"` | Execution mode controlling AI generation behavior |
| - | `openai.defaultTimeoutMs` | Positive integer (ms) | `30000` | Hard timeout for LLM fetch calls |
| - | `openai.maxRetries` | Min 0 | `2` | Max retry attempts for transient AI errors |
| - | `openai.initialBackoffMs` | Positive integer (ms) | `500` | Initial exponential backoff delay |
| - | `openai.backoffMultiplier` | Positive number | `2` | Backoff multiplier per retry step |
| - | `openai.temperature` | `0.0` - `2.0` | `0.2` | Temperature for article content generation |
| - | `openai.visibilityTemperature` | `0.0` - `2.0` | `0.3` | Temperature for AI visibility simulation queries |
| - | `prompts.defaultVersion` | Version String | `"2.0"` | Default prompt template version |
| - | `costOptimizer.tokenThresholdHigh` | Positive integer | `8000` | Token threshold for routing to high-capacity models |
| - | `embeddings.dimensions` | Positive integer | `1536` | Vector embedding dimension size for pgvector |
| - | `embeddings.maxUploadBytes` | Positive integer (bytes) | `10485760` (10MB) | Max raw document upload byte cap |
| - | `embeddings.defaultChunkSize` | Positive integer | `1000` | Character size for text chunking |
| - | `embeddings.defaultChunkOverlap` | Positive integer | `150` | Overlap characters between chunks |

---

### 3. Pipeline Stage Registry (`src/config/pipeline.ts`)

Configures stage execution, retry policies, timeouts, and model classes across all 8 DAG pipeline stages.

| Stage ID | Display Name | Dependencies | Max Retries | Timeout | Parallelisable | Model Class |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `research` | Fact & Context Research | `[]` | 3 | 30s | `false` | `default` |
| `strategy` | Strategic Content Positioning | `["research"]` | 3 | 30s | `false` | `highCapacity` |
| `outline` | Article Outline Architecture | `["strategy"]` | 3 | 30s | `false` | `default` |
| `writer` | Prose & Section Generation | `["outline"]` | 3 | 60s | `false` | `highCapacity` |
| `editor` | Copy Editing & Formatting | `["writer"]` | 2 | 30s | `true` | `default` |
| `seo_optimizer` | SEO & Metadata Optimization | `["editor"]` | 2 | 30s | `true` | `default` |
| `fact_check` | Claim & Source Verification | `["seo_optimizer", "research"]` | 2 | 45s | `true` | `highCapacity` |
| `schema_generator` | Structured JSON-LD Schema | `["seo_optimizer"]` | 2 | 30s | `true` | `default` |

---

### 4. Cache Configuration (`src/config/cache.ts`)

| Environment Variable | Config Property | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `SEMANTIC_CACHE_ENABLED` | `cache.enabled` | `true` | Globally enable or disable LLM semantic cache |
| - | `cache.defaultTtlSeconds` | `86400` (24 hours) | Default TTL for cached generation payloads |
| - | `cache.stageTtlSeconds.writer` | `43200` (12 hours) | Specific TTL for writer stage outputs |

---

### 5. Evaluation Profiles Registry (`src/config/evaluation.ts`)

| Profile ID | Category Weight Matrix | Priority Weights Matrix | Purpose |
| :--- | :--- | :--- | :--- |
| `default` | Equal (0.1 each across 10 categories) | Vol: 0.30, Diff: 0.25, Comm: 0.20, Trend: 0.15, Biz: 0.10 | Standard balanced quality evaluation |
| `seo_focused` | Readability: 0.15, SEO: 0.25, Entity: 0.15 | Vol: 0.45, Diff: 0.20, Comm: 0.15, Trend: 0.10, Biz: 0.10 | Search optimization focused evaluation |
| `brand_strict` | Factual: 0.20, Brain: 0.20, Voice: 0.15, Citation: 0.10 | Vol: 0.15, Diff: 0.15, Comm: 0.20, Trend: 0.10, Biz: 0.40 | Compliance and brand integrity evaluation |

---

### 6. Knowledge Graph Extraction Profiles (`src/config/knowledgeGraph.ts`)

Configures domain entity extraction categories, relationship types, and trigger keywords.

- **Categories**: `product`, `service`, `brand`, `competitor`, `person`, `location`, `technology`, `industry`.
- **Relationship Types**: `belongs_to`, `competes_with`, `uses`, `offers`, `targets`, `located_in`, `partnered_with`.
- **Max Context Limits**: 10 entities, 10 edges per brand context compilation.

---

### 7. Limits & Infrastructure Settings (`src/config/limits.ts`)

| Action / Setting | Capacity / Limit | Window / Timeout | Description |
| :--- | :--- | :--- | :--- |
| `rateLimits.contentBrief` | 10 calls | 60,000 ms (1 min) | Brief creation rate limit |
| `rateLimits.pipelineRun` | 5 calls | 60,000 ms (1 min) | Pipeline execution rate limit |
| `rateLimits.visibilitySnapshot` | 10 calls | 60,000 ms (1 min) | AI visibility query rate limit |
| `rateLimits.documentUpload` | 10 calls | 60,000 ms (1 min) | Brand document upload rate limit |
| `rateLimits.inviteSend` | 20 calls | 3,600,000 ms (1 hour) | Workspace invite rate limit |
| `competitor.fetchTimeoutMs` | - | 8,000 ms (8s) | Competitor crawler fetch timeout |
| `competitor.maxResponseBytes` | 2,097,152 (2MB) | - | Competitor page response cap |
| `cookie.currentBrandName` | `"nl_current_brand"` | 365 days | Cookie identifier for active brand |

---

### 8. Background Jobs Configuration (`src/config/jobs.ts`)

| Environment Variable | Config Property | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `JOBS_WORKER_SECRET` | `jobs.workerSecret` | `""` | Secret key for cron worker endpoint authorization |
| - | `jobs.maxJobsPerRun` | `25` | Max job claim batch per worker loop iteration |
| - | `jobs.claimStaleAfterMs` | `300000` (5 min) | Stale locked job claim expiration threshold |
| - | `jobs.retryBackoffMs` | `30000` (30s) | Base retry backoff for failed job attempts |
| - | `jobs.defaultMaxAttempts` | `3` | Default max attempts before job is marked failed |

---

### 9. Typed Feature Flags (`src/config/featureFlags.ts`)

Supports flag resolution across `global`, `environment`, `workspace`, and `brand` scopes.

| Flag Key | Env Variable Override | Default | Description |
| :--- | :--- | :--- | :--- |
| `enableDeepKnowledgeGraph` | `FEATURE_DEEP_KG` | `true` | Multi-hop entity extraction in Knowledge Graph |
| `enableParallelPipelineStages` | `FEATURE_PARALLEL_PIPELINE` | `true` | Concurrent execution of topological level DAG stages |
| `enableLLMEvaluation` | `FEATURE_LLM_EVALUATION` | `true` | Post-pipeline multi-dimensional quality evaluation |
| `enableRealtimeVisibilityAlerts` | `FEATURE_VISIBILITY_ALERTS` | `true` | Automatic alert creation on visibility position drop |
| `enableCostAwareFallback` | `FEATURE_COST_AWARE_FALLBACK` | `true` | Automatic model routing fallback on cost threshold |
| `enableExperimentalPrompts` | `FEATURE_EXPERIMENTAL_PROMPTS` | `false` | Enable experimental v3 prompt templates |

---

## Verification & Health Check

All configuration schemas are validated at application boot time via `validateConfiguration()` in `src/config/index.ts`. If any environment variable or setting fails schema validation, the process will fail fast with a descriptive error trace.
