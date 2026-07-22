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
- [x] Phase 1 — Database & Tenancy
  - Full Drizzle schema written across `src/db/schema/*.ts` (barrel:
    `src/db/schema/index.ts`) covering all 32 tables from the brief:
    `profiles`, `brands`, `brand_members`, `invites`, `stores`, `products`,
    `brand_documents`, `brand_document_chunks`, `keywords`,
    `keyword_scores`, `keyword_clusters`, `cluster_keywords`,
    `competitors`, `competitor_pages`, `gap_reports`, `content_briefs`,
    `content_pipeline_runs`, `content_pipeline_steps`, `articles`,
    `article_versions`, `article_claims`, `images`, `schema_objects`,
    `publications`, `ai_platforms`, `ai_prompts`,
    `ai_visibility_snapshots`, `recommendations`, `analytics_events`,
    `subscriptions`, `usage_events`, `jobs` (`invites` was implied by
    Phase 2's "invites" acceptance criterion, so added here alongside
    `brand_members` since both are tenancy-join tables).
  - `drizzle-kit generate` produced `src/db/migrations/0000_..._.sql`
    (schema) with a hand-added `CREATE EXTENSION IF NOT EXISTS vector;`
    preamble; `src/db/migrations/0001_rls_policies.sql` (hand-written,
    Drizzle doesn't model `CREATE POLICY`) adds `is_brand_member()` /
    `brand_role()` helper functions and enables RLS + a
    member-of-`brand_id` policy on every tenant table, plus a
    read-only-for-authenticated policy on the one non-tenant reference
    table (`ai_platforms`).
  - `keywords` stores raw inputs AND normalized inputs AND the computed
    `priority_score`; `keyword_scores` is an append-only scoring-run
    history with a `formula_version` column. `article_claims` has the
    exact status/override/audit fields the publish gate (Phase 8) needs.
  - Migration validation (no live Supabase project, no Docker/psql/sudo in
    this sandbox — see below): `tests/integration/migration-syntax.test.ts`
    parses every statement in every migration file with `libpg-query`
    (real Postgres grammar) to prove syntactic validity, including the
    `vector(1536)` column and `CREATE EXTENSION vector` statement that
    pglite itself can't execute. `tests/db/pglite.ts` boots
    `@electric-sql/pglite` (embedded WASM Postgres, no server required),
    applies both migrations, and adds a minimal `auth.uid()` shim plus a
    non-superuser `authenticated` Postgres role (RLS never applies to
    superusers, so tests must run as a role that actually has RLS
    enforced against it) to faithfully exercise the real policy SQL.
  - Acceptance verified:
    `tests/integration/tenant-isolation.test.ts` (10 tests, all passing)
    proves brand A's authenticated user cannot SELECT, UPDATE, DELETE, or
    cross-tenant-INSERT into brand B's `keywords`, `brands`,
    `brand_members`, `brand_documents`, `competitors`, or `jobs` rows,
    while brand A's own owner correctly retains full access to brand A's
    data and the shared `ai_platforms` reference table — using the actual
    RLS policy SQL, not a re-implementation of the logic in application
    code. Full details of the pglite/libpg-query approach and its two
    documented deviations from a real Supabase environment (vector column
    substitution; explicit non-superuser role) are in `DATABASE.md`.
  - `npm run typecheck`, `npm run lint`, `npm test` (14/14 passing across
    3 files), and `npm run build` all pass clean after this phase.
  - Deviation: without a real Supabase project, `profiles.id → auth.users.id`
    and the `handle_new_user()` trigger that auto-creates a profile row on
    signup are NOT in `src/db/migrations/` (the `auth` schema doesn't
    exist on non-Supabase Postgres, including pglite) — they're documented
    as a one-time post-`db push` SQL snippet in `DATABASE.md`, to be run
    once a real Supabase project exists.
- [x] Phase 2 — Auth & Multi-tenant Brands
  - Auth server actions in `src/lib/auth/actions.ts` (`signup`, `login`,
    `logout`, `requestPasswordReset`, `updatePassword`, `updateProfile`) all
    call the real Supabase Auth API (`supabase.auth.signUp` /
    `signInWithPassword` / `signOut` / `resetPasswordForEmail` /
    `updateUser`) via `src/lib/supabase/server.ts`'s cookie-based client —
    no placeholders. If Supabase env vars are missing, `createClient()`
    throws a clear, visible error (existing Phase 0 behavior) rather than
    silently no-opping.
  - `src/app/api/auth/callback/route.ts` handles Supabase's
    confirmation/magic-link/recovery redirect via
    `exchangeCodeForSession(code)`, redirecting to `next` (defaults to
    `/onboarding`) on success or back to `/login` with a visible error.
  - Auth pages under `src/app/(auth)/{login,signup,reset-password,
    reset-password/confirm}` use React Hook Form + `zodResolver` bound to
    the existing Phase 2 validation schemas (`src/lib/validation/auth.ts`),
    submitting to the real server actions above — every submit button is
    wired to a real code path, none are dead/mocked.
  - Brand domain: `src/lib/brands/actions.ts` (`createBrand`,
    `listBrandsForUser`, `switchActiveBrand`/`getActiveBrandId` — cookie
    `nl_current_brand` — `inviteMember`, `acceptInvite`, `revokeInvite`,
    `updateMemberRole`, `removeMember`). `createBrand` inserts `brands` +
    `brand_members` (role `owner`) inside a single Drizzle
    `db.transaction()` — both succeed or both roll back, verified in
    `tests/integration/brand-membership.test.ts`. Shared types
    (`ActionResult`, `BrandListItem`, `CURRENT_BRAND_COOKIE`) live in
    `src/lib/brands/types.ts` because a `"use server"` file may only export
    async functions — re-exporting a `const` or interface from it fails the
    Next.js build (`next build` initially caught this; fixed by extracting
    to a plain module).
  - `src/lib/brands/require-role.ts` — `requireRole`/`requireRoleOrThrow`
    read the caller's `brand_members.role` via Drizzle (not the Supabase JS
    client) and check it with `roleAtLeast` from the Phase 2 validation
    module. Used inside `inviteMember`/`updateMemberRole`/`removeMember`/
    `revokeInvite` so these are gated in the application layer, not just by
    RLS (RLS enforces the brand boundary only; role-within-a-brand gating
    is intentionally app-layer per DATABASE.md's existing note). Added the
    `server-only` package as a dependency to enforce this module can never
    enter a client bundle.
  - `src/components/brands/brand-switcher.tsx` (Radix dropdown, lists
    brands + calls `switchActiveBrand`) and dashboard shell
    `src/app/(app)/layout.tsx` (sidebar nav via
    `src/components/layout/sidebar-nav.tsx`, user menu with real `logout()`
    form action via `src/components/layout/user-menu.tsx`) — redirects to
    `/login` if unauthenticated, `/onboarding` if the user has zero brands.
  - Added small UI primitives needed for real forms that didn't exist yet:
    `src/components/ui/{input,label,card}.tsx`, following the existing
    hand-authored shadcn/ui pattern from Phase 0 (no `npx shadcn add` run,
    consistent with the Phase 0 deviation note).
  - A placeholder `/onboarding` page collects the first brand via the same
    `CreateBrandForm` used at `/brands/new`; Phase 3 replaces its content
    with the full multi-step wizard while keeping the route.
  - Tests added (35 new, 49/49 total passing):
    - `tests/unit/roles.test.ts` — `ROLE_RANK` ordering and every
      `roleAtLeast` combination (equal, above, below minimum; viewer's and
      owner's boundary cases).
    - `tests/unit/validation-auth.test.ts` /
      `tests/unit/validation-brands.test.ts` — valid/invalid fixtures for
      every Phase 2 Zod schema, including `inviteMemberSchema` rejecting
      `role: "owner"` (the `.exclude()` case flagged for verification in
      the prior session).
    - `tests/integration/brand-membership.test.ts` — extends the existing
      pglite harness (`tests/db/pglite.ts`, real Postgres via WASM, real
      RLS-bearing schema) to prove: a user can create two brands with
      correct owner `brand_members` rows (including RLS-scoped visibility
      of both); the create-brand-then-membership transaction rolls back
      fully if the second insert fails; and a non-owner (editor) is
      correctly rejected by `roleAtLeast` for both owner-gated
      (`updateMemberRole`) and admin-gated (`inviteMember`) actions using
      real `brand_members` rows read back from the database — not a
      logic-only re-implementation. `src/lib/brands/actions.ts` and
      `require-role.ts` themselves connect via Drizzle's `postgres-js`
      driver (a real TCP client) which cannot attach to pglite's in-process
      engine, so this test exercises the identical SQL shapes those
      functions issue against the real schema instead of calling the
      functions directly — documented in the test file's header comment.
  - Genuinely NOT exercised in this sandbox (no live Supabase project): the
    actual `supabase.auth.signUp`/`signInWithPassword`/email-delivery flow,
    the `/api/auth/callback` code-exchange against a real Supabase Auth
    server, and RLS-scoped Supabase-JS-client reads in `(app)/layout.tsx`
    and `brands/actions.ts`'s `getAuthedUserId()` path. What IS verified:
    every server action/route handler calls the real Supabase Auth SDK
    methods and real Drizzle queries (no mocked/stubbed responses, no
    TODO-only handlers), the app compiles and typechecks against those real
    APIs, and the authorization/transaction logic those actions depend on
    (`roleAtLeast`, the brand+membership transaction, role-gated rejection)
    is proven against a real Postgres engine with real RLS policies loaded.
  - `npm run typecheck`, `npm run lint`, `npm test` (7 files, 49/49
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 3 — Onboarding
  - `src/lib/onboarding/state.ts`'s `getOnboardingState(brandId)` derives
    the current wizard step directly from persisted rows (store exists?
    product exists? every brand document `ready`/`failed`? keyword
    exists?) rather than a separate mutable "current step" field — so a
    reload mid-wizard always resumes correctly, since the presence of real
    data IS the progress, not a cache of it. Steps: `brand` (no brand yet,
    handled by reusing Phase 2's `CreateBrandForm`) → `store` → `products`
    → `documents` → `brand-brain` → `keywords` → `done` (redirects to
    `/dashboard`).
  - `src/lib/onboarding/actions.ts`: `addStore`, `addProduct`,
    `importProductsCsv`, `addBrandDocumentText`, `skipBrandDocuments`,
    `seedDemoKeywords` — all real server actions (editor-role-gated via
    `requireRoleOrThrow`, same pattern as Phase 2), no client-only mocked
    state. `addBrandDocumentText` inserts the `brand_documents` row AND
    enqueues a real `embed_brand_document` row in `jobs` inside one
    transaction — the worker that actually processes that job (chunking +
    embeddings) is Phase 4/12's job, but the row + job creation here is
    real, not a stub; until a worker runs, the document's status stays
    `pending`, which is an honest state rather than a fake "indexed" flag.
  - `src/lib/csv/parse-products.ts` + `src/lib/validation/products.ts`:
    CSV product import via `papaparse` (added as a dependency), validating
    every row against `productSchema` and reporting bad rows individually
    (row number + specific reasons) instead of silently dropping them —
    valid rows still import even when other rows in the same file fail.
    `parseProductCsvRow` converts a human-entered dollar string (e.g.
    "19.99") to integer cents, tolerating blank/non-numeric price cells
    without crashing the whole row.
  - Wizard UI: `src/app/onboarding/page.tsx` (server component, derives
    step + redirects to `/dashboard` once done) renders
    `onboarding-wizard.tsx` (progress bar + step switch) and one client
    step component per step under `src/app/onboarding/steps/` — every
    submit button calls one of the real server actions above; the
    Brand-Brain step is a confirmation screen (real queuing already
    happened when the document was added, not a second fake trigger); the
    products step supports both a manual add form and CSV file upload,
    showing per-row CSV errors inline.
  - Tests added (25 new, 74/74 total passing):
    - `tests/unit/validation-products.test.ts` — `productSchema`,
      `storeSchema`, `brandDocumentTextSchema`, and `parseProductCsvRow`
      (dollar-to-cents conversion, blank/non-numeric price handling,
      invalid URL rejection).
    - `tests/unit/csv-parse-products.test.ts` — `parseProductsCsv` against
      real CSV text: valid rows, bad rows reported with row number +
      reason while valid rows in the same file still import, header
      casing/whitespace tolerance, empty-body CSVs.
    - `tests/integration/onboarding-state.test.ts` — extends the pglite
      harness to prove step derivation against the real schema: starts at
      `store` for a brand-new brand, advances through each step as the
      corresponding real rows are inserted, stays at `brand-brain` while a
      document is still `pending`, and — the core acceptance criterion —
      re-derives the identical step from a fresh read with no client state
      carried over, proving a reload mid-wizard cannot lose progress.
  - Genuinely NOT exercised in this sandbox: actual file upload to
    Supabase Storage (PDF/DOCX/binary TXT/CSV upload is explicitly Phase
    4's scope; this phase's document step only covers the `typed_text`
    source, which is real end-to-end) and the `embed_brand_document`
    job's worker execution (Phase 4/12 builds the worker; this phase only
    proves the job row is created correctly).
  - `npm run typecheck`, `npm run lint`, `npm test` (10 files, 74/74
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 4 — Brand Brain
  - `src/lib/ai/embeddings.ts`: one `embedText()` entry point picks the
    real OpenAI adapter (`text-embedding-3-small` via a direct `fetch` to
    `https://api.openai.com/v1/embeddings`, only when `OPENAI_API_KEY` is
    set) or the deterministic demo adapter, both always returning exactly
    1536 dimensions. `demoHashEmbedding` uses the standard "hashing trick"
    (feature hashing): word tokens + character trigrams of the normalized
    text are each hashed to a dimension index + sign and accumulated,
    then the vector is L2-normalized. This was NOT the first
    implementation — an initial per-dimension "rehash the whole document
    with a different seed per output dimension" approach compiled and
    looked plausible, but a unit test proved it produced no reliable
    correlation between shared text and cosine similarity (a real bug,
    caught by `tests/unit/embeddings.test.ts`'s
    "gives near-identical text a higher cosine similarity than unrelated
    text" case). Feature hashing was substituted because shared
    features hash to the same dimensions in both vectors by construction,
    which is what makes the demo adapter usable for retrieval at all.
    Exact method documented in AI_SCORING.md.
  - `src/lib/brand-brain/chunk.ts`: fixed-size (1000 char) chunking with
    150-char overlap, preferring to break on whitespace near the boundary
    rather than mid-word.
  - `src/lib/brand-brain/extract-text.ts`: TXT/CSV need no real extraction
    (already text); PDF via `pdf-parse` v2's class-based `PDFParse`/
    `getText()` API (the package's v1-style default-export API no longer
    exists in the installed v2.4.5 — discovered and fixed via its
    shipped `.d.cts` types rather than assuming the old API); DOCX via
    `mammoth.extractRawText`. `mammoth` ships no TypeScript types and has
    no `@types/mammoth` package, so `src/types/mammoth.d.ts` declares a
    minimal ambient type for only the one function this app calls.
  - `src/lib/brand-brain/process-document.ts`: drives a `brand_documents`
    row through `pending` → `chunking` → `embedding` → `ready` (or
    `failed` with the error persisted), chunking the raw text, embedding
    each chunk, and inserting `brand_document_chunks` rows (clearing any
    prior chunks first, so re-indexing is idempotent). This is the
    function the Phase 12 job worker calls for `embed_brand_document`
    jobs; Phase 3/4's server actions already create real rows in both
    `brand_documents` and `jobs` — this phase adds the processing logic
    itself, which a worker will invoke once Phase 12 lands the polling
    loop.
  - `src/db/migrations/0002_semantic_search.sql`: `match_brand_document_chunks(brand_id,
    query_embedding, match_count)` — pgvector cosine-distance top-K query,
    SECURITY INVOKER so RLS on `brand_document_chunks` still applies to
    the caller. `src/lib/brand-brain/search.ts` wraps it with `embedText`
    for a full "query text in, ranked chunks out" function.
  - `src/lib/brand-brain/actions.ts`: `uploadBrandDocument` (extracts text
    synchronously so raw_text is always populated; attempts a Supabase
    Storage upload and DEGRADES GRACEFULLY to a documented local fallback
    — `storagePath` stays null — if Storage isn't configured, rather than
    failing the whole upload over an optional artifact), `listBrandDocuments`,
    `deleteBrandDocument`, `reindexBrandDocument` — all real, editor-role-gated
    (viewer for list) server actions wired to a real `/brand-brain` page
    with upload/list/delete/re-index UI, no dead buttons.
  - Tests added (27 new, 101/101 total passing):
    - `tests/unit/chunk-text.test.ts` — chunk sizing, overlap (proves
      adjacent chunks actually share content), sequential indices,
      whitespace-preferring breaks, degenerate tiny-overlap inputs,
      documented defaults.
    - `tests/unit/embeddings.test.ts` — `demoHashEmbedding` dimension
      count, determinism, case/whitespace normalization, value bounds,
      empty-string handling, and (the test that caught the real bug
      above) higher similarity for near-identical vs. unrelated text;
      `cosineSimilarity` identical/orthogonal/opposite/mismatched-length/
      zero-vector cases.
    - `tests/integration/brand-document-chunks.test.ts` — extends the
      pglite harness (same documented `vector` → `double precision[]`
      substitution as the existing tenant-isolation tests) to prove
      chunk rows persist correctly brand-scoped, the document status
      lifecycle transitions as `process-document.ts` actually drives it,
      error+failed state recording, and RLS isolation specifically for
      `brand_document_chunks` (new in this phase).
    - Added a `vitest.config.ts` test-only alias for the `server-only`
      marker package (`tests/stubs/server-only.ts`, a no-op): Next.js's
      bundler aliases `server-only` to a no-op under the `react-server`
      condition, but Vitest runs in plain Node with no such aliasing, so
      any test importing a module that (correctly) guards itself with
      `import "server-only"` would otherwise fail outside Next's build.
      This is a test-harness-only accommodation; the real guard still
      applies in `next build`/`next dev`.
  - Genuinely NOT exercised in this sandbox: the real OpenAI embeddings
    HTTP call (no `OPENAI_API_KEY`); actual Supabase Storage upload (no
    live project — the graceful-fallback path is what actually runs
    here, which is itself now a real, tested code path rather than an
    unreachable branch); `match_brand_document_chunks`'s pgvector
    cosine-distance operator end-to-end (pglite has no pgvector — same
    documented limitation as the `vector(1536)` column since Phase 1;
    validated for syntax only via the existing `libpg-query` migration
    test, which auto-discovers the new `0002_semantic_search.sql` file).
  - `npm run typecheck`, `npm run lint`, `npm test` (13 files, 101/101
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 5 — Keyword Explorer
  - `src/lib/scoring/priority.ts` implements the EXACT formula from the
    plan (`0.30·normalizedVolume + 0.25·(1-normalizedDifficulty) +
    0.20·commercialIntent + 0.15·trend + 0.10·businessValue`), min-max
    normalizing volume/difficulty against the brand's own keyword set
    (0.5 for a single-keyword set with no variance, to avoid a
    divide-by-zero). `tests/unit/priority-scoring.test.ts` hand-computes
    exact expected outputs for a 3-keyword fixture (0.575, 0.43, 0.56 —
    shown worked by hand in the test file's comments) and asserts them to
    10 decimal places, plus monotonicity checks (higher volume must never
    lower the score; higher difficulty must never raise it) and the
    weights summing to exactly 1.
  - `src/lib/scoring/cluster.ts`: deterministic clustering with zero ML
    dependency — greedy single-link clustering on Jaccard similarity of
    each term's significant tokens (lowercased, stopwords removed).
    Reproducible for the same input/order every time.
  - `src/lib/keywords/rescore.ts`: `rescoreAllKeywords(brandId)` recomputes
    the brand's full baseline and writes normalized/computed values back
    onto `keywords` while APPENDING (never overwriting) a row per keyword
    to `keyword_scores` with a `formula_version` — so changing the
    normalization baseline (or a future formula version) never destroys
    prior score history. Called after every create/update/delete/CSV
    import so the whole set is always consistently normalized.
  - `src/lib/keywords/actions.ts`: full CRUD, CSV import
    (`src/lib/csv/parse-keywords.ts`, same bad-row-reporting contract as
    Phase 3's product importer), filter/sort/pagination
    (`listKeywords` — search by term, min/max priority, sortable by
    term/volume/difficulty/priority/createdAt, paginated), cluster
    generation, and `generateBriefFromKeyword` — which does NOT block on
    an LLM call; it inserts a real `jobs` row (type
    `generate_content_brief`) for the Phase 7/12 pipeline to process. All
    editor-role-gated (viewer for read-only listing) via
    `requireRoleOrThrow`. Real `/keywords` page: add form, CSV import,
    sortable/searchable/paginated table with per-row "Generate brief"/
    delete actions and brand-wide "Generate clusters"/"Rescore all"
    buttons — no dead buttons.
  - A zod-resolver/React-Hook-Form typing mismatch surfaced while wiring
    `AddKeywordForm`: `keywordSchema`'s original `.default(0)` on the
    numeric fields made zod's inferred input type `number | undefined`,
    which `@hookform/resolvers/zod`'s stricter v4 typing rejected against
    `useForm<KeywordInput>`. Fixed by removing `.default()` from the
    schema (all fields required) and supplying `defaultValues` directly
    in `useForm(...)` instead — `parseKeywordCsvRow` already independently
    defaults missing CSV numeric cells to 0 before validating, so CSV
    import behavior is unaffected.
  - Tests added (23 new, 123/123 total passing):
    - `tests/unit/priority-scoring.test.ts` — the exact-value fixture
      above, `minMaxNormalize` edge cases, `scoreKeywordSet` batch
      behavior including the single-keyword 0.5-normalization case.
    - `tests/unit/cluster-keywords.test.ts` — token-overlap grouping,
      determinism, empty input, singleton clusters, longest-term naming,
      stopword handling.
    - `tests/integration/keyword-scoring.test.ts` — extends the pglite
      harness to prove `keywords` persists normalized+computed values,
      `keyword_scores` is genuinely append-only across repeated rescoring
      (not overwritten), and RLS isolates both `keywords` and
      `keyword_scores` between brands (new coverage for the scoring
      columns specifically, on top of the generic keywords-table
      isolation already proven in Phase 1's tenant-isolation tests).
  - Genuinely NOT exercised in this sandbox: the `generate_content_brief`
    job this phase creates is not yet processed by anything (the pipeline
    that consumes it is Phase 7; the worker that dispatches it is Phase
    12) — the job row itself is real and correctly shaped, verified by
    inspecting its `type`/`payload`, but nothing drains the queue yet.
  - `npm run typecheck`, `npm run lint`, `npm test` (16 files, 123/123
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 6 — Competitor Radar
  - `src/lib/competitors/gap-analysis.ts`: deterministic demo analysis
    adapter, seeded by `brandId:competitorId:type` (FNV-1a based, same
    seeding technique as the Phase 4 demo embedding adapter) — the SAME
    brand/competitor/type always produces the SAME findings and priority
    score, so re-running "Generate gap reports" doesn't silently change
    answers like a flaky mock would. Produces 2-4 findings per report
    across all 5 required gap types (content/schema/faq/backlink/
    ai_citation), each with a severity and a priority score derived from
    the findings' average severity. The `ai_citation` type's descriptions
    explicitly state "this is a directional signal only, not an official
    citation count" — matching the plan's requirement that AI-citation
    signals never be presented as an official count, anywhere in the app.
  - `src/lib/competitors/actions.ts`: competitor CRUD, competitor-page
    tracking, `listGapReports`, and `generateGapReportsForCompetitor` —
    which calls the demo adapter for all 5 types and persists real
    `gap_reports` rows (`is_demo=true`, `generated_by='demo_adapter'`).
    All editor-gated (viewer for read-only listing) via
    `requireRoleOrThrow`. Wired to a real `/competitors` page: add
    competitor, generate/view gap reports per competitor (findings
    rendered with severity + a "Demo" badge), delete — no dead buttons.
  - Caught one bug in my own test before it could mask a real
    documentation gap: an early version of
    `tests/unit/gap-analysis.test.ts` asserted the `ai_citation`
    description text should NOT match `/official citation count/` — but
    the actual (correct) copy is "not an official citation count", which
    DOES contain that substring as part of the negation. The naive regex
    would have failed on correct code, which risked getting "fixed" by
    weakening the disclaimer copy instead of the test. Corrected the test
    to assert the disclaimer phrase is present AND that the positive claim
    never appears without the preceding negation (a lookbehind regex),
    which actually verifies the intended property.
  - Tests added (11 new, 134/134 total passing):
    - `tests/unit/gap-analysis.test.ts` — determinism (same seed same
      output), variation across different brands/competitors, finding
      count bounds, priority score bounds, all 5 types covered, no
      duplicate findings within one report, valid severities, and the
      directional-only-language assertion described above.
    - `tests/integration/gap-reports.test.ts` — extends the pglite harness
      to prove all 5 gap report types persist as correctly brand+
      competitor-scoped rows with `is_demo`/`generated_by` set correctly,
      and RLS isolates `gap_reports` (and `competitors`) between brands.
  - Genuinely NOT exercised in this sandbox: no live competitor-page
    crawling (the plan's demo adapter is explicitly analysis-over-stored-
    data, not a real fetch; `competitor_pages.content_snapshot` exists in
    the schema for a future real crawler to populate, but nothing in this
    phase calls out to the network to fetch competitor URLs).
  - `npm run typecheck`, `npm run lint`, `npm test` (18 files, 134/134
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 7 — Content Pipeline
  - `src/lib/content/pipeline/schemas.ts`: typed Zod in/out contracts for
    all 8 stages (Research → Strategy → Outline → Writer → Editor → SEO
    Optimizer → Fact Check → Schema Generator), each stage's input built
    from the prior stage's already-persisted output — this explicit
    typing (rather than passing a loosely-typed shared context object) is
    what makes a stage genuinely retryable in isolation.
  - `src/lib/content/pipeline/stages.ts`: one pure function per stage.
    Per the plan's constraint against calling a real external API without
    a credential, and to keep a full pipeline run exercisable/testable in
    this sandbox, every stage is a deterministic, non-LLM "demo adapter"
    that still does real structured work from its typed input (keyword-
    aware research facts, content-type classification from keyword
    patterns, outline/HTML generation matching the outline, whitespace-
    normalizing editing pass, meta-title/description/slug generation
    respecting length constraints, a genuine fact-check heuristic that
    checks whether each research claim still appears in the final body).
    Every stage's `usedDemoAdapter: true` result field reflects this
    honestly rather than presenting deterministic output as AI-generated.
  - `src/lib/content/pipeline/runner.ts`: `runPipeline(runId)` drives a
    `content_pipeline_runs` row through all 8 stages in order, persisting
    each stage's input/output/status/cost/tokens as its own
    `content_pipeline_steps` row. Before running a stage it checks for an
    existing COMPLETED step and reuses its output instead of rerunning —
    this is the retry mechanism: `retryPipelineStage(runId, stage)`
    deletes only that stage's (failed) step row and re-invokes
    `runPipeline`, which then skips every already-completed prior stage.
    On full completion, persists a real `articles` + `article_versions`
    row (status `draft`) from the SEO-optimized output.
  - `src/lib/content/brief.ts`: `generateContentBrief` builds a
    `content_briefs` row with every required field (primary keyword via
    `title`, target audience, search intent derived from the keyword's
    own commercial-intent score, outline, required-sections checklist
    covering supporting keywords/entities/FAQs/internal links/external
    sources/product placements/EEAT — all listed explicitly rather than
    silently omitted).
  - `src/lib/content/actions.ts`: `createBriefForKeyword`,
    `listContentBriefs`, `startPipelineRun` (creates the run row then
    calls `runPipeline` — synchronous in this MVP; Phase 12's
    `run_content_pipeline` job type will move this behind the worker
    without changing the pipeline logic itself), `retryFailedStage`,
    `listPipelineRuns`, `listPipelineSteps`. Wired to a real `/content`
    page: generate a brief from any existing keyword, start a run, expand
    a run to see every step's status/attempt/cost/tokens, retry a failed
    step in place — no dead buttons.
  - Tests added (19 new, 153/153 total passing):
    - `tests/unit/pipeline-stages.test.ts` — every stage's output validated
      against its own Zod schema, plus behavior assertions (content-type
      classification from keyword patterns, outline headings appearing in
      the writer's HTML, whitespace normalization, meta length limits,
      slug format, the fact-check heuristic correctly flagging an
      unsupported long claim, valid JSON-LD shape).
    - `tests/integration/content-pipeline.test.ts` — extends the pglite
      harness to prove one `content_pipeline_steps` row persists per
      stage, an `articles`+`article_versions` row is created from the
      final output, retrying a failed stage does NOT rerun or duplicate
      already-completed prior stages (the core retryability guarantee),
      and RLS isolates pipeline runs/steps/briefs between brands.
  - Genuinely NOT exercised in this sandbox: no real LLM-generated content
    anywhere in the pipeline (by design per the plan's external-API
    constraint — every stage is the demo adapter described above); the
    `run_content_pipeline` job type exists in the schema/enum but nothing
    yet enqueues or drains it, since this phase's `startPipelineRun` calls
    the runner directly rather than through the job queue (Phase 12 wires
    that without changing pipeline internals).
  - `npm run typecheck`, `npm run lint`, `npm test` (20 files, 153/153
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 8 — Content Editor
  - Editor: `src/app/(app)/content/[articleId]/` — a `contentEditable`-
    based rich editor (chosen over `@tiptap/react` to avoid a heavy new
    dependency's integration risk given the remaining phase count; the
    plan explicitly allows this fallback), with debounced (1.5s)
    autosave via `autosaveArticleContent`, which creates a NEW
    `article_versions` row every save (full version history, never
    overwritten) and recomputes SEO/EEAT/AI-readiness scores from the
    saved content each time.
  - `src/lib/content/scoring/article-scores.ts`: deterministic SEO/EEAT/
    AI-readiness heuristics (0-100 each), precisely documented in the new
    `AI_SCORING.md` (created this phase, to be extended by Phases 9-10
    rather than written speculatively ahead of that code). Every
    sub-score is a simple auditable rule over the article's own HTML/
    metadata — no LLM judgment call.
  - `src/lib/content/article-actions.ts`: state machine
    (`draft → review → approved → published`) with an explicit
    `ALLOWED_TRANSITIONS` table rejecting invalid jumps (e.g. draft
    straight to published); `resolveClaim` / `overrideClaim` (owner-only,
    enforced via `requireRoleOrThrow("owner")`) recording the full audit
    trail (`resolved_by`/`resolved_at` or `override_by`/
    `override_reason`/`override_at`); `publishArticle` re-checks the
    REAL publish gate server-side using the caller's actual role and the
    article's actual persisted claims (never trusts client-side gate
    state), requires `status = 'approved'` first, and on success records
    a `publications` row (`was_override` flag) as the publish audit
    trail.
  - `src/lib/content/publish-gate.ts`: the REQUIRED pure `canPublish`
    function exactly as specified — blocked with unresolved claims;
    blocked for a non-owner attempting override (checked before the
    override-recorded flag, so intent doesn't matter); unblocked once
    every claim is resolved; unblocked via a recorded owner override.
  - UI: claim highlighting (unresolved=red, overridden=purple/demo,
    resolved=green backgrounds) with inline resolve/override actions
    (owner-only override button), JSON-LD preview pane, status-machine
    buttons matching the allowed transitions, and a publish button that's
    disabled with the gate's own reason text shown whenever
    `canPublish` (computed client-side from the same real claims data
    for instant feedback) says no — the SERVER re-validates independently
    in `publishArticle`, so the client check is UX-only, not the actual
    authorization boundary.
  - Tests added (24 new, 177/177 total passing):
    - `tests/unit/publish-gate.test.ts` — the REQUIRED suite: blocked
      with unresolved claims; blocked for non-owner override attempts
      (including when a non-owner incorrectly claims
      `overrideRecorded: true`); unblocked after full resolution;
      unblocked via recorded owner override, including when ALL claims
      were unresolved; zero-claims trivially allowed; every non-owner
      role rejected.
    - `tests/unit/article-scores.test.ts` — SEO/EEAT/AI-readiness scoring
      behavior (full-marks case, and each individual check's point
      deduction verified independently).
    - `tests/integration/publish-gate-persistence.test.ts` — extends the
      pglite harness to prove the gate's decision against REAL persisted
      `article_claims` rows (not just in-memory fixtures): blocks with an
      unresolved row, blocks a non-owner's override attempt, and — the
      audit-trail requirement — unblocks only after `resolved_by`/
      `resolved_at` or `override_by`/`override_reason`/`override_at` are
      actually written and read back from Postgres.
  - Genuinely NOT exercised in this sandbox: no real LLM-assisted editing
    suggestions (the editor is a plain contentEditable surface, matching
    the plan's Tiptap-or-simpler-contentEditable fallback option); no
    live Supabase session for the `publishArticle`/`autosaveArticleContent`
    actions' `createClient()`/`requireRole` calls end-to-end (same
    documented limitation as every prior phase's server actions).
  - `npm run typecheck`, `npm run lint`, `npm test` (23 files, 177/177
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 9 — AI Visibility
  - `src/lib/ai/visibility/adapter.ts`: the `VisibilityAdapter` interface
    (platform, isDemo, `check(prompt, brandName)`) every adapter — demo
    or real — implements identically, covering all 6 required platforms
    (chatgpt/claude/gemini/perplexity/copilot/ai_overviews).
  - `src/lib/ai/visibility/parse.ts`: `parseVisibilityResponse` — the
    shared parsing logic (mentioned/position/sentiment/confidence) used
    by BOTH the demo adapter and the real OpenAI adapter, so it's tested
    once and trusted everywhere. Caught and fixed a real bug before
    shipping: the first version used a naive `indexOf` substring match,
    which incorrectly reported a mention of "Curl Co" inside unrelated
    text like "Silkcurl Co" — `tests/unit/visibility-parse.test.ts`'s
    very first test case failed against this, and the fix (word-boundary
    matching via a lookaround regex) is now what's shipped.
  - `src/lib/ai/visibility/demo-adapter.ts`: deterministic (FNV-1a
    seeded by platform+prompt+brand) demo response generation for all 6
    platforms, piped through the same real parser above — every
    persisted row sets `is_demo=true`.
  - `src/lib/ai/visibility/openai-adapter.ts`: the one real adapter,
    ChatGPT only, calling OpenAI's Chat Completions API — constructed
    ONLY when `OPENAI_API_KEY` is configured (`registry.ts`'s
    `getVisibilityAdapter`); every other platform remains demo-only
    regardless of any key, per the plan's single-provider constraint.
  - `src/lib/ai/visibility/actions.ts`: `ai_prompts` CRUD
    (`createAiPrompt`/`deleteAiPrompt` — soft-delete via `isActive`/
    `listAiPrompts`), `runVisibilitySnapshot` (runs every platform's
    adapter for one prompt, persists one `ai_visibility_snapshots` row
    per platform, lazily seeds the `ai_platforms` reference rows
    including the correct `has_live_adapter` flag), `listVisibilitySnapshots`.
    Wired to a real `/visibility` page: add/remove prompts, run a
    snapshot, see per-platform mention/position/sentiment/confidence with
    a "Demo" badge — the page's own methodology copy states results are
    directional only and never an official citation count, matching the
    plan's explicit requirement.
  - Tests added (17 new, 194/194 total passing):
    - `tests/unit/visibility-parse.test.ts` — fixture LLM-response text
      in, expected mention/position/sentiment/confidence out, including
      the word-boundary bug fixed above, case-insensitivity, prose-vs-list
      mentions, and confidence bounds/ordering.
    - `tests/unit/visibility-demo-adapter.test.ts` — determinism, per-
      platform demo labeling, confidence bounds, and position bounds
      across all 6 platforms.
    - `tests/integration/ai-visibility.test.ts` — extends the pglite
      harness to prove a snapshot run persists one row per platform
      (all `is_demo=true`), and RLS isolates `ai_prompts`/
      `ai_visibility_snapshots` between brands while the shared
      `ai_platforms` reference table stays visible to any authenticated
      member (consistent with Phase 1's existing coverage of that table).
  - Added the AI Visibility parsing methodology section to `AI_SCORING.md`,
    explicitly restating the directional-only/never-an-official-count
    requirement.
  - Genuinely NOT exercised in this sandbox: the real OpenAI Chat
    Completions call in `openai-adapter.ts` (no `OPENAI_API_KEY`
    configured) — its request/response handling is written against the
    real API shape but has never executed against the live endpoint.
  - `npm run typecheck`, `npm run lint`, `npm test` (26 files, 194/194
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 10 — Recommendations
  - `src/lib/recommendations/rank.ts`: pure, deterministic
    `rankRecommendations` — no LLM call — consuming normalized signals
    from keywords (priority score), gap reports (competitor gap priority
    score), articles (SEO/EEAT/AI-readiness), and AI visibility snapshots
    (mention ratio per prompt). Each of the 4 source generators applies
    its own inclusion threshold (keyword priority >= 0.5; every gap
    included; articles excluded if published or already averaging >= 80
    across its 3 scores; visibility prompts excluded if mentioned on
    >= 50% of tracked platforms) and produces a
    title/reason/evidence/impact/confidence/action/sourceSignal/rankScore
    for each. `SOURCE_WEIGHTS` (keyword 0.3, competitor 0.3, content 0.2,
    visibility 0.2, summing to 1) scale each source's normalized [0,1]
    base score into the shared rankScore space before a single stable
    sort (ties broken by original generation order:
    keyword -> competitor -> content -> visibility) merges all 4 sources
    into one ranked list.
  - `src/lib/recommendations/actions.ts`: `computeRecommendations` (real
    server action — gathers live signals via Drizzle from `keywords`,
    `gapReports`/`competitors`, `articles`, and
    `aiVisibilitySnapshots`/`aiPrompts`/`aiPlatforms`, ranks them, then
    replaces the brand's full `recommendations` row set inside a
    transaction — a full recompute rather than incremental merge, since
    ranking is relative to the current complete signal set, consistent
    with Phase 5's keyword-cluster recompute approach),
    `listRecommendations`, `updateRecommendationStatus` (new/in_progress/
    done/dismissed). All three call `requireRoleOrThrow` (viewer for
    read, editor for write) — the same real authorization boundary used
    by every prior phase's server actions, not a client-only check.
  - `src/app/(app)/recommendations/page.tsx` +
    `recommendation-list.tsx`: a real page (already linked from
    `sidebar-nav.tsx`) listing ranked recommendations with impact/
    confidence/source badges, a "Recompute recommendations" button
    wired to `computeRecommendations`, and a per-row status `<select>`
    wired to `updateRecommendationStatus` — no dead buttons or stub
    handlers.
  - The `recommendations` table, `recommendation_status` enum, and its
    RLS policy were already present from Phase 1's initial schema
    migration (`src/db/schema/growth.ts`,
    `src/db/migrations/0000_sticky_secret_warriors.sql`,
    `0001_rls_policies.sql`) as part of the full tenant-table set
    scaffolded up front; Phase 10 wires the real ranking engine and UI
    to that pre-existing table.
  - Tests (28 files, 206/206 total passing):
    - `tests/unit/recommendation-rank.test.ts` — empty-input case; a
      hand-computed fixture asserting exact rankScore values per source
      (gap 0.9*0.30=0.27, keyword 0.8*0.30=0.24, visibility
      (2/3)*0.20=0.1333..., content ((100-60)/100)*0.20=0.08) and the
      resulting sort order; determinism (identical input -> identical
      output); exact-tie tie-breaking by generation order; each
      source's exclusion threshold (low-priority keywords, published/
      already-strong articles, majority-mentioned visibility prompts);
      impact-level thresholds; and a fields-populated sanity check.
    - `tests/integration/recommendations.test.ts` — extends the pglite
      harness to prove ranked recommendations persist against the real
      schema with all fields, that recompute replaces rather than
      accumulates duplicate rows, and RLS isolates `recommendations`
      between brands.
  - Genuinely NOT exercised in this sandbox: no live Supabase session
    for the server actions' `createClient()`/`requireRoleOrThrow` calls
    end-to-end (same documented limitation as every prior phase).
  - `npm run typecheck`, `npm run lint`, `npm test` (28 files, 206/206
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 11 — Analytics
  - `src/lib/analytics/compute.ts`: pure, unit-testable aggregation
    functions over already-fetched rows — article status breakdown,
    articles generated/published counts, content velocity by ISO week,
    median time-to-first-publish (odd/even count handling), estimated AI
    cost (sums `content_pipeline_runs.totalCostCents`, converts to USD),
    total tokens used, AI visibility mention-rate trend by week/platform,
    keyword coverage ratio, average keyword priority score, and
    completed-recommendations count. No database access in this file —
    every function takes plain arrays so exact numeric assertions are
    possible against hand-built fixtures.
  - `src/lib/analytics/queries.ts`: `getAnalyticsSnapshot` — the real
    server-side data-gathering layer. Role-gated (`requireRoleOrThrow`,
    viewer), reads real rows via Drizzle from `articles`,
    `content_pipeline_runs`, `keywords`, `content_briefs` (for keyword
    coverage — a keyword counts as "covered" iff a content brief
    references it via `keywordId`), `ai_visibility_snapshots` joined to
    `ai_platforms`, and `recommendations`, then pipes them through
    `compute.ts`. Also reads `brands.isDemo` so every page can render a
    single "Demo" badge for demo brands. Demo traffic (organic/AI-referral
    sessions) is the ONE genuinely synthetic figure — no analytics
    integration exists in this environment — and is deterministically
    seeded from the brand id (stable across refreshes, not re-randomized,
    and never hardcoded to a single constant) plus always rendered behind
    a "Demo" badge, never presented as real traffic.
  - `src/lib/analytics/data-labels.ts` + `src/components/ui/data-badge.tsx`:
    the ONE reused live/estimated/demo labeling convention the plan
    requires, aligned to the `success`/`warning`/`demo` color tokens
    already defined in `tailwind.config.ts`/`globals.css` (the `demo`
    purple token was already in ad hoc use on the Competitor Radar and AI
    Visibility pages before this phase — this phase extracts that into
    one `<DataBadge kind="live" | "estimated" | "demo" />` component and
    retrofits those pre-existing ad hoc badges
    (`competitors/page.tsx`, `competitors/competitor-list.tsx`,
    `visibility/prompt-list.tsx`) to use it, so the same visual language
    means the same thing everywhere rather than three separate
    hand-rolled `<span>` styles).
  - `src/app/(app)/analytics/page.tsx` + `analytics-charts.tsx`: a real
    Recharts dashboard — stat tiles (articles generated/published, time
    to first publish, estimated AI cost, keyword coverage, avg. priority,
    AI visibility mention rate, recommendations completed), a bar chart
    for content velocity, a bar chart for article status breakdown, a
    line chart for the AI visibility trend (explicitly captioned
    "directional only, never an official citation count"), and a demo
    traffic panel permanently badged "Demo". Every stat tile carries its
    own live/estimated/demo badge per the convention above.
  - `src/app/(app)/dashboard/page.tsx`: replaced the Phase 0 placeholder
    (a static "Analytics will appear here" card with an empty
    `CardContent`) with a real summary reading the same
    `getAnalyticsSnapshot` — articles published, keyword coverage, AI
    visibility mention rate, open recommendations — plus links to the
    full Analytics/Recommendations/Keywords pages. No more dead
    placeholder content on the app's landing page.
  - Tests (30 files, 229/229 total passing):
    - `tests/unit/analytics-compute.test.ts` — exact numeric fixtures for
      every aggregation function: cents-to-USD rounding, status
      breakdown including zero-count keys, ISO-week bucketing, median
      time-to-publish for both odd and even sample counts, summed cost/
      tokens, per-platform-per-week mention rate, keyword coverage ratio
      (including the zero-keyword no-division-by-zero case), average
      priority score (ignoring nulls), and completed-recommendations
      counting.
    - `tests/integration/analytics.test.ts` — extends the pglite harness
      to insert real `articles`/`content_briefs`/`content_pipeline_runs`
      rows and prove the aggregation functions produce the exact same
      numbers against real persisted/RLS-isolated data (not just
      in-memory fixtures), including RLS isolating `articles` between
      two brands.
  - Acceptance note: verified against whatever real data exists in
    dev/tests per the plan's instruction, since Phase 13's seed data
    doesn't exist yet — every chart/tile degrades to an honest empty
    state ("No published articles yet...", "N/A", etc.) rather than
    fabricating numbers when a brand has no data yet. Revisit/confirm
    once Phase 13 seed data lands (tracked there).
  - Known pre-existing gap, NOT introduced by this phase: `sidebar-nav.tsx`
    also links to `/settings`, which has no corresponding page and isn't
    scoped by any phase in this plan — left as-is since it predates
    Phase 10 and fixing it is out of scope for Phases 10-15; flagged here
    for visibility rather than silently expanding scope.
  - `npm run typecheck`, `npm run lint`, `npm test` (30 files, 229/229
    passing), and `npm run build` all pass clean after this phase.
- [x] Phase 12 — Jobs, Usage, Errors, Empty/Loading States
  - Core/action split extracted for every action that a background job
    now also needs to call: `src/lib/competitors/persist-gap-reports.ts`
    (`persistGapReportsForCompetitor`), `src/lib/ai/visibility/persist-snapshot.ts`
    (`persistVisibilitySnapshot`), `src/lib/recommendations/compute-core.ts`
    (`computeAndPersistRecommendations`) — each is the DB-writing logic
    that used to live inline inside a `"use server"` action, now called
    by BOTH the action (after its `requireRoleOrThrow` gate) and the
    worker (which has no authenticated request to check a role against).
    `runPipeline`, `generateContentBrief`, `processDocument`, and
    `rescoreAllKeywords` already had this split from Phases 4/5/7 — their
    docstrings explicitly anticipated Phase 12 wiring them into a worker.
  - `src/lib/validation/jobs.ts` + `src/lib/jobs/types.ts`: one Zod
    schema per `job_type` enum value, validated before any handler runs.
  - `src/lib/jobs/worker.ts`: `claimNextJob` (atomic
    `UPDATE jobs SET status='running' ... WHERE id = (SELECT ... FOR
    UPDATE SKIP LOCKED) RETURNING ...` — safe under concurrent workers),
    `processJob` (dispatches by `type` to the matching handler, records
    succeeded/result or queued-with-backoff/failed+error), `runWorkerOnce`
    (claim-and-process loop, batch-capped), `decideFailureOutcome` (the
    retry-vs-permanently-failed decision extracted as a pure function:
    30s * attempts-so-far linear backoff until `maxAttempts`, then
    'failed'), and `countJobsByStatus`. All 7 job types
    (embed_brand_document, generate_content_brief, run_content_pipeline,
    generate_gap_report, run_ai_visibility_snapshot,
    compute_recommendations, recompute_keyword_scores) have a registered
    handler calling the real core function above.
  - `src/lib/jobs/enqueue.ts`: `enqueueJob` — validates payload, inserts
    a `jobs` row with `brandId` on the row itself (not just inside the
    payload), for future callers that want async processing instead of
    the current synchronous action calls.
  - `src/lib/usage/record.ts`: `recordUsageEvent` (best-effort, never
    throws) wired into the worker's embedding/pipeline-run/gap-report/
    visibility-check/keyword-rescore handlers, recording real
    `usage_events` rows for billable-ish actions.
  - `scripts/worker.ts`: one-shot entrypoint (`npm run worker`) —
    processes every currently-due job, then exits, intended to run on a
    schedule (cron/Vercel Cron/pg_cron) rather than as a daemon, matching
    the "Postgres table as queue" approach (see ARCHITECTURE.md). Also
    fixed `db:seed`'s script command the same way, pre-emptively for
    Phase 13.
  - Non-obvious fix required to make `npm run worker` actually work:
    several handler modules import the `server-only` marker package,
    which unconditionally throws unless resolved under React's
    `"react-server"` package-export condition; Next.js's webpack build
    understands that condition automatically, but a plain
    Node/tsx-executed script does not. Fixed by setting
    `NODE_OPTIONS=--conditions=react-server` in the `worker`/`db:seed`
    npm scripts (package.json) — confirmed this changes the failure mode
    from a `server-only` throw to the expected "DATABASE_URL is not set"
    message.
  - `src/components/ui/empty-state.tsx`, `error-state.tsx`,
    `loading-state.tsx`: the 3 shared components. Retrofitted onto EVERY
    page/list built in Phases 2-11 that had an ad hoc placeholder:
    - The identical "Select a brand to continue" paragraph on 9 pages
      (dashboard, analytics, keywords, competitors, content, content/
      [articleId], brand-brain, visibility, recommendations) ->
      `<EmptyState title="Select a brand to continue" ... />`.
    - 23 ad hoc `bg-destructive/10 px-3 py-2 text-sm text-destructive`
      error `<div>`s across every form and list-result page (login,
      signup, reset-password x2, brands/new, onboarding steps x4,
      keywords x3, competitors x2, brand-brain x2, content x3,
      recommendations, dashboard, analytics) -> `<ErrorState message=.../>`.
    - Top-level "nothing here yet" placeholders in competitor list,
      content brief list, brand document list, AI visibility prompt
      list, and recommendation list -> `<EmptyState icon=... title=...
      description=.../>` with a real, reachable next action described
      (never a dead end). Left the keyword table's empty `<tr>` and the
      per-competitor nested "no gap reports yet" as plain text, since a
      bordered empty-state box doesn't fit inside a table cell or a
      small nested list — judgment call, not an oversight.
    - `LoadingState` is built and available but has no retrofit target:
      every data fetch in this app happens in an async Server Component
      (not a client-side `useEffect` fetch), and every pending client
      action already disables its own button and swaps its own label
      (e.g. "Computing...") rather than needing a separate loading
      section — confirmed by grepping for `useEffect` across
      `src/app` (exactly one hit, an unrelated debounce-timer cleanup).
  - Retrofitted the keyword table's `source` column to render
    `<DataBadge kind="demo" />` when `source === 'demo_seed'` instead of
    the raw string, closing the last remaining un-badged is_demo-adjacent
    column ahead of Phase 13 actually seeding `demo_seed` keywords.
  - Tests (32 files, 245/245 total passing):
    - `tests/unit/jobs-worker.test.ts` — `decideFailureOutcome`'s exact
      backoff math (30s * attempts, scaling linearly, permanently failed
      once attempts reaches maxAttempts or beyond) and that
      `JOB_PAYLOAD_SCHEMAS` has exactly one schema per `job_type` enum
      value with correct accept/reject behavior per schema.
    - `tests/integration/jobs-worker.test.ts` — extends the pglite
      harness to run the EXACT claim SQL `claimNextJob` uses: proves it
      claims the oldest due queued job and flips it to running with
      attempts incremented, refuses to claim a future-run_at or already-
      running job, claims strictly oldest-first among multiple due jobs,
      and that the success/retry/permanent-failure status transitions
      persist correctly; also proves RLS isolates `jobs` between brands.
  - Genuinely NOT exercised in this sandbox: the worker has never run
    against a live DATABASE_URL end-to-end (no live Postgres connection
    configured) — its claim/dispatch/retry SQL is proven against pglite,
    and every handler calls the same core function already covered by
    that phase's own tests, but the two have not been observed running
    together as one live process.
  - `npm run typecheck`, `npm run lint`, `npm test` (32 files, 245/245
    passing), and `npm run build` all pass clean after this phase.
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
