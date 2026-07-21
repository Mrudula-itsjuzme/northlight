# Northlight — Implementation Plan

Northlight is an AI Growth OS for D2C brands. This plan tracks the build of a
production-ready MVP from an empty repository.

## Stack

- Next.js 14 (App Router), TypeScript strict
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage, RLS, pgvector)
- Drizzle ORM (typed schema + SQL migrations)
- Zod for all typed contracts between AI stages
- React Hook Form
- Recharts
- Vitest (unit/integration), Playwright (e2e, best-effort in this environment)
- One LLM provider adapter: OpenAI (`OPENAI_API_KEY`), with a demo/mock adapter
  fallback when no key is configured. Never call a real provider without a key.
- Deployment target: Vercel (app) + Supabase (data plane)

## Architecture

Modular monolith. No Kafka/Kubernetes/Snowflake/microservices. Slow AI work
(embeddings, brief/article generation, visibility checks) runs through a
Postgres-backed `jobs` table processed by a worker route/script — no Redis
dependency required for MVP.

Every tenant-owned table carries `brand_id` with RLS policies scoping access
to `brand_members`.

## Phases & Acceptance Criteria

### Phase 0 — Scaffold
- Next.js app initialized, TS strict, Tailwind + shadcn configured.
- Supabase client (server + browser) wired, env vars documented in `.env.example`.
- Drizzle configured against Supabase Postgres.
- Acceptance: `npm run dev` boots, `npm run typecheck` passes on empty app.

### Phase 1 — Database & Tenancy
- Full schema migration covering all tables listed in the brief (profiles,
  brands, brand_members, stores, products, brand_documents,
  brand_document_chunks, keywords, keyword_scores, keyword_clusters,
  cluster_keywords, competitors, competitor_pages, gap_reports,
  content_briefs, content_pipeline_runs, content_pipeline_steps, articles,
  article_versions, article_claims, images, schema_objects, publications,
  ai_platforms, ai_prompts, ai_visibility_snapshots, recommendations,
  analytics_events, subscriptions, usage_events, jobs).
- RLS policies on every tenant table keyed off `brand_members`.
- pgvector extension + embedding column on `brand_document_chunks`.
- Acceptance: migration applies cleanly; RLS isolation test proves brand A
  cannot read brand B's rows.

### Phase 2 — Auth & Multi-tenant Brands
- Supabase Auth: signup, login, logout, password reset, profile.
- Brand creation, brand switcher, roles (owner/admin/editor/viewer), invites.
- Acceptance: new user can sign up, create 2 brands, switch between them;
  role-gated actions enforced server-side.

### Phase 3 — Onboarding
- Wizard: account → brand details → store details → manual product entry →
  CSV product import → brand document upload → Brand Brain indexing →
  demo keyword seed → dashboard redirect.
- Acceptance: full onboarding completes end-to-end and data persists on reload.

### Phase 4 — Brand Brain
- Upload TXT/CSV/PDF/DOCX + typed text; chunk, embed (OpenAI or demo hash
  embedding), store with source metadata; semantic retrieval function;
  delete + re-index.
- Acceptance: retrieval returns relevant chunks for a query against seeded docs.

### Phase 5 — Keyword Explorer
- CRUD, CSV import, filters/sort/pagination, clustering, priority scoring
  formula (exact weights from brief), AI citation opportunity field,
  "Generate Brief" action.
- Acceptance: scoring unit tests pass; table persists, filters/sorts work.

### Phase 6 — Competitor Radar
- Add competitor, competitor pages, gap reports (content/schema/FAQ/backlink/
  AI citation gaps), priority scores, brand-vs-competitor comparison, demo
  analysis adapter.
- Acceptance: gap report generation (demo adapter) persists and renders.

### Phase 7 — Content Pipeline
- Typed stages: Research → Strategy → Outline → Writer → Editor → SEO
  Optimizer → Fact Check → Schema Generator, each Zod-validated in/out,
  persisted per-step, retryable, token/cost logged.
- Content briefs generated and stored with all required fields.
- Acceptance: brief → article run completes via background job, steps visible
  with status/cost.

### Phase 8 — Content Editor
- Rich editor, autosave, versions, draft/review/approved/published states,
  SEO/EEAT/AI-readiness scores, claim highlighting + resolution + owner
  override with audit record, JSON-LD preview, publish gate on unresolved
  claims.
- Acceptance: publish blocked while claims unresolved; unblocks after
  resolution/override; test covers this rule.

### Phase 9 — AI Visibility
- Configurable prompt panel, provider adapters (ChatGPT/Claude/Gemini/
  Perplexity/Copilot/AI Overviews) + demo adapter, mention/position/sentiment/
  confidence parsing, snapshots, platform + overall scores, methodology copy.
- Acceptance: demo adapter produces a snapshot; parsing unit-tested.

### Phase 10 — Recommendations
- Ranking engine over keyword/competitor/content/visibility signals; each
  recommendation has title/reason/evidence/impact/confidence/action/status.
- Acceptance: ranking unit tests pass against fixture signals.

### Phase 11 — Analytics
- Dashboards from real stored data; demo data clearly labeled; live vs
  estimated vs demo distinguished in UI.
- Acceptance: analytics reflect seeded demo brand data correctly.

### Phase 12 — Jobs, Usage, Errors, Empty/Loading States
- Jobs table + worker; usage_events tracking; consistent error/empty/loading
  states across modules.

### Phase 13 — Seed/Demo Data
- One complete demo brand (tween haircare) with products, docs, keywords,
  competitors, gaps, articles, visibility history, recommendations, analytics
  matching target demo scores, all labeled as demo.

### Phase 14 — Tests, Lint, Typecheck, Build
- Vitest coverage for: keyword scoring, visibility parsing, recommendation
  ranking, tenant isolation, publish restrictions, onboarding→article flow.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all green.

### Phase 15 — Documentation & Deployment
- README.md, ARCHITECTURE.md, AI_SCORING.md, DATABASE.md, .env.example,
  deployment steps, demo login instructions.

## Status Log

- [x] Phase 0 — Scaffold
  - Next.js 14 App Router + TS strict scaffolded via `create-next-app` (in a
    scratch dir, merged in to preserve existing repo files).
  - Tailwind v3.4 configured with shadcn/ui set up **by hand** (classic
    Radix-primitive pattern: `@radix-ui/react-*` + `class-variance-authority`
    + `cn()` util + HSL CSS variables), not via `npx shadcn init`. The
    current `shadcn@latest` CLI defaults to a Tailwind-v4-oriented preset
    (`@import "shadcn/tailwind.css"`, `oklch()` tokens, a `shadcn` runtime
    package, `ring-3`/`has-data-*` utility classes) that isn't compatible
    with the Tailwind v3 pipeline this plan specifies, and broke the build
    (unknown `next/font/google` `Geist` export, unresolved v4 CSS imports).
    Reverted those CLI-installed pieces and hand-authored
    `components.json` / `tailwind.config.ts` / `globals.css` / `button.tsx`
    in the standard pre-v4 shadcn/ui style instead. Future
    `npx shadcn add <component>` calls should still work against this
    config for adding components one at a time.
  - Supabase browser client, server client (cookie-based, `@supabase/ssr`),
    service-role client (server-only, RLS-bypassing, isolated in
    `server.ts` which already requires `next/headers` so it can never enter
    a client bundle), and session-refresh middleware wired in
    `src/lib/supabase/*` and `src/middleware.ts`.
  - Drizzle configured (`drizzle.config.ts`, `src/db/index.ts`,
    `src/db/schema.ts` placeholder table) targeting Postgres via
    `DATABASE_URL`; real schema lands in Phase 1.
  - Vitest configured (`vitest.config.ts`) with a smoke test; Testing
    Library + jsdom installed for later component tests.
  - `@electric-sql/pglite` installed as the local-Postgres stand-in for
    Phase 1's migration/RLS validation, since this sandbox has no Docker,
    no `psql`/`pg_ctl`, and no passwordless `sudo` to install a real
    Postgres server. It has real npm registry access, so pglite (a WASM
    build of actual Postgres, no daemon/Docker required) was chosen over
    testcontainers (needs Docker) or an in-memory SQLite shim (wrong SQL
    dialect for RLS/pgvector work). This is documented in detail in
    DATABASE.md once Phase 1 lands.
  - `.env.example` documents every env var with comments; `.gitignore`
    updated to also ignore plain `.env` (not just `.env*.local`).
  - Acceptance verified: `npm run dev` serves `/` with HTTP 200,
    `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`
    all pass clean.
  - Deviation: Node 20.20.2 is installed in this sandbox; latest
    `@supabase/supabase-js` sub-dependencies (`postgrest-js`,
    `realtime-js`, `storage-js`) declare `engines.node >=22`. This is a
    soft npm warning only (install and build both succeed on Node 20); the
    README notes Node 22+ as the recommended runtime for deployment.
- [ ] Phase 1 — Database & Tenancy
- [ ] Phase 2 — Auth & Multi-tenant Brands
- [ ] Phase 3 — Onboarding
- [ ] Phase 4 — Brand Brain
- [ ] Phase 5 — Keyword Explorer
- [ ] Phase 6 — Competitor Radar
- [ ] Phase 7 — Content Pipeline
- [ ] Phase 8 — Content Editor
- [ ] Phase 9 — AI Visibility
- [ ] Phase 10 — Recommendations
- [ ] Phase 11 — Analytics
- [ ] Phase 12 — Jobs/Usage/Error States
- [ ] Phase 13 — Seed/Demo Data
- [ ] Phase 14 — Tests/Lint/Build
- [ ] Phase 15 — Documentation & Deployment

## Required Credentials (pause points)

- `OPENAI_API_KEY` — enables real embeddings + generation. Without it, the
  app runs fully on deterministic demo adapters (clearly labeled).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` — needed to provision a real
  Supabase project. Until provided, migrations/schema are written and
  verified against a local Postgres for correctness.
