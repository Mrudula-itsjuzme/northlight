# Database

Northlight's data plane is Supabase Postgres. Schema is defined once, in
TypeScript, with Drizzle ORM (`src/db/schema/*.ts`) and compiled to plain
SQL migrations (`src/db/migrations/*.sql`) via `drizzle-kit generate`. RLS
policies are hand-written SQL (Drizzle doesn't model `CREATE POLICY`) in
`src/db/migrations/0001_rls_policies.sql`.

## How to apply the schema to a real Supabase project

You need a Supabase project's connection string (`DATABASE_URL`) in
`.env.local`. Then either:

```bash
# Option A: run the Drizzle-generated SQL directly
npm run db:migrate

# Option B: use the Supabase CLI (equivalent, if you prefer Supabase's own
# migration tracking table)
supabase db push
```

Additionally, on a real Supabase project only (not on local/test Postgres,
because the `auth` schema doesn't exist there), run this one-time snippet to
link `profiles.id` to Supabase's own `auth.users` table and to auto-create a
profile row on signup:

```sql
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

This is not part of `src/db/migrations/` because those files are also
applied to the local pglite test harness, which has no `auth` schema.

## Why this sandbox couldn't run migrations against a live Supabase project

There is no Supabase project provisioned for this build (no credentials
available — see the "Required Credentials" section of
`IMPLEMENTATION_PLAN.md`), and the development sandbox has:

- no Docker (`docker` is not installed),
- no local Postgres server (`psql`, `pg_ctl` are not installed),
- no passwordless `sudo` (so `apt-get install postgresql` was not possible),
- but it does have working npm registry access.

Given those constraints, schema and RLS correctness are validated two
different ways instead, each covering a different kind of correctness:

### 1. Syntactic validity — `libpg-query`

`tests/integration/migration-syntax.test.ts` parses every statement in
every migration file with [`libpg-query`](https://www.npmjs.com/package/libpg-query),
a Node binding around the actual `libpg_query` C library extracted from
Postgres's own parser. If a statement doesn't parse, Postgres itself
wouldn't accept it either — this is not a heuristic linter, it's the real
grammar. This is what proves the exact SQL that would run against Supabase
(including `CREATE EXTENSION vector;` and `vector(1536)` columns) is
well-formed, without needing a pgvector-capable engine available in the
sandbox.

### 2. Behavioral validity — `pglite`

`tests/db/pglite.ts` boots [`@electric-sql/pglite`](https://www.npmjs.com/package/@electric-sql/pglite),
a WASM build of real Postgres that runs in-process with no server/Docker
required, applies both migration files to it, and `tests/integration/tenant-isolation.test.ts`
exercises the actual RLS policy SQL against it — proving brand A truly
cannot read/update/delete brand B's rows, not just asserting that in the
abstract.

Two adjustments were necessary to make pglite a faithful stand-in for
Supabase Postgres, both documented in code comments at their point of use:

- **pgvector isn't bundled in `@electric-sql/pglite@0.5.4`'s contrib
  extensions.** The test harness applies a copy of migration 0000 with
  `vector(1536)` rewritten to `double precision[]` for the one column that
  uses it (`brand_document_chunks.embedding`) — every other column, table,
  constraint, index, and all of the RLS migration is applied completely
  unmodified. No test asserts on vector similarity search, so this
  substitution doesn't mask anything the test suite claims to prove.
- **pglite's default connection role is a Postgres superuser**
  (`rolbypassrls = true`), and RLS never applies to superusers/table
  owners on any Postgres, by design. If tests queried as that default role,
  every isolation assertion would pass vacuously regardless of whether the
  policies were even correct. The harness creates a non-superuser
  `authenticated` role (mirroring the role Supabase's PostgREST actually
  connects as) and every test query runs `SET ROLE authenticated` first, so
  RLS is genuinely in effect for the duration of the test.
- **pglite has no `auth` schema** (that's a Supabase platform feature layered
  on top of vanilla Postgres, not part of Postgres itself). The harness
  defines a minimal `auth.uid()` SQL function that reads a session-level
  `request.jwt.claim.sub` setting — precisely mirroring how Supabase's
  PostgREST injects the JWT's `sub` claim before RLS policies evaluate
  `auth.uid()`. Every RLS policy in this app is written purely in terms of
  `auth.uid()`, so this shim is sufficient to run the real policy logic
  unmodified.

Net result: the exact same 32-table schema and the exact same RLS policies
run in both environments; only one embedding column's type differs in the
test harness, and that difference is called out both here and inline in
`tests/db/pglite.ts`.

## Multi-tenancy model

- `brands` is the tenant root.
- `brand_members` (brand_id, user_id, role) is the single join table every
  RLS policy keys off of. Roles: `owner`, `admin`, `editor`, `viewer`.
- Every tenant-owned table has a `brand_id` column with `ON DELETE CASCADE`
  back to `brands`, and an RLS policy requiring
  `public.is_brand_member(brand_id)` for all of SELECT/INSERT/UPDATE/DELETE.
- `ai_platforms` is the one table that is NOT tenant-owned (it's a small
  global reference table of supported AI platforms, seeded once). It has
  its own RLS policy: readable by any authenticated user, writable only via
  migrations/service role.
- Role-gated actions that need richer authorization than "any member can
  do this" (e.g. "only owner/admin can invite new members", "only owner can
  override an unresolved content claim") are enforced in the application
  layer (server actions / route handlers), not in RLS — RLS's job here is
  strictly brand-boundary isolation, which is what
  `tests/integration/tenant-isolation.test.ts` proves.

## Schema overview (32 tables)

| Domain | Tables |
|---|---|
| Identity & tenancy | `profiles`, `brands`, `brand_members`, `invites` |
| Brand setup | `stores`, `products`, `brand_documents`, `brand_document_chunks` |
| Keywords | `keywords`, `keyword_scores`, `keyword_clusters`, `cluster_keywords` |
| Competitors | `competitors`, `competitor_pages`, `gap_reports` |
| Content pipeline | `content_briefs`, `content_pipeline_runs`, `content_pipeline_steps`, `articles`, `article_versions`, `article_claims`, `images`, `schema_objects`, `publications` |
| AI Visibility | `ai_platforms`, `ai_prompts`, `ai_visibility_snapshots` |
| Growth | `recommendations`, `analytics_events` |
| Billing | `subscriptions`, `usage_events` |
| Jobs | `jobs` |

Full column-level detail lives in `src/db/schema/*.ts` (the source of
truth) — this document describes shape and intent, not a duplicated column
list that can drift out of sync.

### Keywords: raw values vs. computed score

`keywords` stores both the raw inputs (`raw_volume`, `raw_difficulty`,
`raw_commercial_intent`, `raw_trend`, `raw_business_value`) AND the derived
values actually used in the formula (`normalized_volume`,
`normalized_difficulty`) AND the final `priority_score`. `keyword_scores` is
an append-only history table — every time scores are recomputed (e.g.
because a new keyword changed the min-max normalization baseline for the
brand), a new row is inserted rather than overwriting history, with a
`formula_version` column so a future change to the weights doesn't corrupt
historical comparisons. See `AI_SCORING.md` for the exact formula.

### Jobs: Postgres-backed queue, no Redis

`jobs` (id, brand_id, type, payload, status, attempts, run_at, result,
error) is polled by a worker route/script (`npm run worker`, or a route
handler invoked by a cron trigger). No Redis/BullMQ — see `ARCHITECTURE.md`.

### AI Visibility is directional only

`ai_visibility_snapshots.is_demo` defaults to `true`; it's only ever `false`
for platforms where `ai_platforms.has_live_adapter = true` (in practice, at
most, an OpenAI-backed adapter, since that's the only provider this app
integrates for real per the plan's constraints) AND `OPENAI_API_KEY` is
configured. `confidence` and `sentiment` are the parser's own extraction
confidence, not a guarantee. Nothing in this schema or its consuming UI
represents these numbers as an official/authoritative citation count.

## pgvector

`brand_document_chunks.embedding` is `vector(1536)` (matches OpenAI's
`text-embedding-3-small`). The demo/mock embedding adapter used when
`OPENAI_API_KEY` is absent also produces 1536-dimension vectors (a
deterministic hash-based embedding — see `AI_SCORING.md`), so retrieval
code doesn't need to branch on which adapter produced a given row.

`src/db/migrations/0002_semantic_search.sql` defines
`match_brand_document_chunks(p_brand_id, p_query_embedding, p_match_count)`
— a Postgres function performing cosine-distance similarity search over
one brand's chunks (`ORDER BY embedding <=> query_embedding LIMIT
match_count`), called by `src/lib/brand-brain/search.ts`. It is
`SECURITY INVOKER` (the default — not `SECURITY DEFINER`), so RLS on
`brand_document_chunks` still applies to whoever calls it; this function
is not a way to bypass tenant isolation, it's scoped by the `p_brand_id`
parameter AND still subject to the calling role's RLS policies. Like the
`vector(1536)` column itself, this function can't be exercised against
pglite (no pgvector extension bundled in `@electric-sql/pglite`'s contrib
set) — it's validated for syntactic correctness only, via
`tests/integration/migration-syntax.test.ts`.

## Analytics, jobs, and usage tables (Phases 10-13)

- `recommendations`: one row per ranked recommendation
  (`title`/`reason`/`evidence`/`impact`/`confidence`/`action`/
  `source_signal`/`rank_score`/`status`), fully replaced (not
  incrementally merged) every time `computeAndPersistRecommendations`
  runs, since ranking is relative to the brand's CURRENT complete signal
  set. See AI_SCORING.md's "Recommendation ranking" section for the exact
  formula.
- `analytics_events`: append-only, freeform (`event_type` + `payload`
  jsonb), used for coarse events like `brand_created`/
  `articles_seeded`/`recommendations_computed` (see `scripts/seed.ts`) —
  distinct from `usage_events` below, which is specifically for
  billable-ish AI/processing actions.
- `usage_events`: append-only, one row per billable-ish action
  (`embedding`, `content_pipeline_run`, `ai_visibility_check`,
  `gap_report_generation`, `keyword_rescore` — see
  `src/lib/usage/record.ts`'s `UsageEventType` union), recorded both from
  the synchronous action paths and from the job worker, so usage is
  tracked identically regardless of which path processed the work.
- `jobs`: the Postgres-backed queue (see ARCHITECTURE.md for why no
  Redis/BullMQ). `src/lib/jobs/worker.ts`'s `claimNextJob` uses
  `SELECT ... FOR UPDATE SKIP LOCKED` inside an `UPDATE ... WHERE id = (
  subquery )` so multiple worker processes can safely race for jobs
  without double-processing the same row — this is proven against the
  real schema in `tests/integration/jobs-worker.test.ts`, including that
  a future-`run_at` or already-`running` job is never (re-)claimed, and
  that failed jobs are retried with a linear backoff
  (`30s * attempts_so_far`) until `max_attempts`, then marked
  permanently `failed`.

All 4 tables carry `brand_id` + the standard tenant RLS policy (see
"Multi-tenancy model" above). `jobs.brand_id` is the one nullable
exception among them (a small number of possible future job types may
not be tenant-scoped — e.g. cross-tenant maintenance — though every job
type actually defined today IS tenant-scoped and always sets it); every
other column here follows the same non-nullable `brand_id` pattern as
every other tenant-owned table in this schema.
